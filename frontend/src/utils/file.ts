/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2026 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

 /**
  * Converts a byte value into a human-readable string format (B, KB, or MB).
  * @example formatBytes(1500) // "1.5 KB"
  * @developerNote This function caps at MB; for larger units, extend the logic.
  */
 export const formatBytes = (bytes: number): string => {
   if (bytes < 1024) return `${bytes} B`;
   if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
   return `${(bytes / 1048576).toFixed(1)} MB`;
 };

 /**
  * Checks if a given file is an image based on its extension.
  * @example isImageFile(new File([''], 'photo.jpg')) // true
  * @developerNote This relies on file extension, not MIME type; consider validating MIME type for stricter checks.
  */
 export const isImageFile = (file: File): boolean => {
   const ext = file.name.split('.').pop()?.toLowerCase() || '';
   return ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'tif', 'webp', 'gif'].includes(ext);
 };
