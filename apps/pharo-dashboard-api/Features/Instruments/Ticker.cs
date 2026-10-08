namespace PharoDashboard.Api.Features.Instruments;

/// <summary>
/// Canonicalizes ticker identifiers without culture-dependent casing or ambiguous symbols.
/// Accepted identifiers match [A-Z0-9][A-Z0-9._-]{0,31} after trimming and normalization.
/// </summary>
public static class Ticker
{
    /// <summary>Returns a canonical identifier or rejects an invalid ticker.</summary>
    public static string Normalize(string value)
    {
        if (!TryNormalize(value, out var canonical))
        {
            throw new ArgumentException("Ticker must contain 1–32 permitted ASCII characters.", nameof(value));
        }

        return canonical;
    }

    /// <summary>Normalizes a valid identifier; null, empty or invalid values return false.</summary>
    public static bool TryNormalize(string? value, out string canonical)
    {
        canonical = value?.Trim().ToUpperInvariant() ?? string.Empty;

        if (canonical.Length is < 1 or > 32 || !char.IsAsciiLetterOrDigit(canonical[0]))
        {
            canonical = string.Empty;
            return false;
        }

        foreach (var character in canonical)
        {
            if (!char.IsAsciiLetterOrDigit(character) && character is not ('.' or '_' or '-'))
            {
                canonical = string.Empty;
                return false;
            }
        }

        return true;
    }
}
