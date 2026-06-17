/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2026 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

 /**
  * Formats a duration in seconds into a human-readable "Xh Ym" string.
  * @example formatUptime(3665) // "1h 1m"
  * @note Truncates seconds; only hours and minutes are included.
  */
 export const formatUptime = (seconds: number): string => {
   const h = Math.floor(seconds / 3600);
   const m = Math.floor((seconds % 3600) / 60);
   return `${h}h ${m}m`;
 };

 /**
  * Formats a Date object into a 24-hour "HH:MM:SS" time string.
  * @example formatTime(new Date(2023, 0, 1, 9, 5, 2)) // "09:05:02"
  * @note Uses zero-padding for single-digit values.
  */
 export const formatTime = (date: Date): string => {
   const hour = date.getHours().toString().padStart(2, '0');
   const minute = date.getMinutes().toString().padStart(2, '0');
   const second = date.getSeconds().toString().padStart(2, '0');
   return `${hour}:${minute}:${second}`;
 };
