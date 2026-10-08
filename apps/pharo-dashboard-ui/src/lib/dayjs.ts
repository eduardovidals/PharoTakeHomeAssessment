import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

// UTC is the only plugin needed for the application's validated DateOnly/epoch inputs.
dayjs.extend(utc);
export { dayjs };
