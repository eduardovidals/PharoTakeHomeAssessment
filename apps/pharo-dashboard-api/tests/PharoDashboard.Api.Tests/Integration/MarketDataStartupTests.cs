using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using PharoDashboard.Api.Data;
using Xunit;

namespace PharoDashboard.Api.Tests.Integration;

public sealed class MarketDataStartupTests
{
    [Fact]
    public async Task StartupEagerlyLoadsOnceAndReusesTheSingletonAfterItsFileChanges()
    {
        using var input = new StartupInput("date,ticker,price\n2026-06-23,AAA,100\n");
        var loadCount = 0;

        using var application = input.CreateApplication(builder => builder.ConfigureTestServices(services =>
        {
            var original = Assert.Single(services, service => service.ServiceType == typeof(MarketDataStore));
            var createStore = original.ImplementationFactory ??
                throw new InvalidOperationException("The store must be initialized by the startup factory.");

            services.RemoveAll<MarketDataStore>();
            services.AddSingleton(provider =>
            {
                Interlocked.Increment(ref loadCount);
                return (MarketDataStore)createStore(provider);
            });
        }));

        using var client = application.CreateClient();

        // No request or explicit store resolution has occurred yet.
        Assert.Equal(1, Volatile.Read(ref loadCount));

        var originalStore = application.Services.GetRequiredService<MarketDataStore>();
        Assert.True(originalStore.TryGetPrices("AAA", out var originalPrices));

        File.WriteAllText(input.Path, "deliberately invalid replacement data");

        await Task.WhenAll(Enumerable.Range(0, 32).Select(async _ =>
        {
            using var response = await client.GetAsync("/health");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

            using var scope = application.Services.CreateScope();
            var currentStore = scope.ServiceProvider.GetRequiredService<MarketDataStore>();
            Assert.Same(originalStore, currentStore);
            Assert.True(currentStore.TryGetPrices(" aaa ", out var currentPrices));
            Assert.Equal(originalPrices, currentPrices);
            Assert.Equal(100m, Assert.Single(currentPrices).Price);
        }));

        File.Delete(input.Path);
        using var secondClient = application.CreateClient();
        using var afterDeletion = await secondClient.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, afterDeletion.StatusCode);
        Assert.Same(originalStore, application.Services.GetRequiredService<MarketDataStore>());
        Assert.Equal(1, Volatile.Read(ref loadCount));
    }

    [Fact]
    public void MissingDataPreventsTheActualHostFromStarting()
    {
        using var input = new StartupInput(null);
        using var application = input.CreateApplication();

        var error = Assert.ThrowsAny<Exception>(() => application.CreateClient());

        Assert.True(ContainsException<FileNotFoundException>(error), error.ToString());
    }

    [Fact]
    public void InvalidDataPreventsTheActualHostFromStarting()
    {
        using var input = new StartupInput("date,ticker,price\n2026-06-23,AAA,0\n");
        using var application = input.CreateApplication();

        var error = Assert.ThrowsAny<Exception>(() => application.CreateClient());

        Assert.True(ContainsException<InvalidDataException>(error), error.ToString());
    }

    [Fact]
    public async Task RelativeDataPathUsesTheActualApplicationBaseContentRoot()
    {
        using var input = new StartupInput("date,ticker,price\n2026-06-23,ROOT,25\n");
        Assert.NotEqual(System.IO.Path.GetFullPath(Environment.CurrentDirectory), input.Directory);

        using var application = input.CreateApplication(relativePath: true);
        using var client = application.CreateClient();
        var environment = application.Services.GetRequiredService<IHostEnvironment>();

        Assert.Equal(System.IO.Path.TrimEndingDirectorySeparator(AppContext.BaseDirectory),
            System.IO.Path.TrimEndingDirectorySeparator(environment.ContentRootPath));

        using var response = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var store = application.Services.GetRequiredService<MarketDataStore>();
        Assert.Equal("ROOT", Assert.Single(store.Tickers));
    }

    private static bool ContainsException<TException>(Exception error) where TException : Exception
    {
        if (error is TException) return true;
        if (error is AggregateException aggregate && aggregate.InnerExceptions.Any(ContainsException<TException>)) return true;

        return error.InnerException is not null && ContainsException<TException>(error.InnerException);
    }

    private sealed class StartupInput : IDisposable
    {
        public string Directory { get; } = System.IO.Directory.CreateTempSubdirectory("pharo-startup-").FullName;
        public string Path => System.IO.Path.Combine(Directory, "market.csv");

        public StartupInput(string? content)
        {
            if (content is not null) File.WriteAllText(Path, content);
        }

        public WebApplicationFactory<Program> CreateApplication(Action<IWebHostBuilder>? configure = null, bool relativePath = false)
        {
            return new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.ConfigureAppConfiguration((_, configuration) =>
                    configuration.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["MarketData:Path"] = relativePath ? System.IO.Path.GetRelativePath(AppContext.BaseDirectory, Path) : Path,
                    }));

                configure?.Invoke(builder);
            });
        }

        public void Dispose() => System.IO.Directory.Delete(Directory, true);
    }
}
