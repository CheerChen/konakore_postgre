import { filesize } from 'filesize';
import { format, fromUnixTime, isValid } from 'date-fns';

/**
 * 格式化文件大小
 * @param {number} bytes - 文件大小（字节）
 * @returns {string} 格式化后的文件大小
 */
export const formatFileSize = (bytes) => {
  if (!bytes) return 'N/A';
  return filesize(bytes, { 
    standard: 'jedec',  // 使用 MB 而不是 MiB
    round: 1 
  });
};

/**
 * 格式化日期
 * @param {number} dateValue - Unix 时间戳
 * @returns {string} 格式化后的日期字符串
 */
export const formatDate = (dateValue) => {
  if (!dateValue && dateValue !== 0) return 'N/A';
  
  try {
    // 将Unix时间戳转换为Date对象
    const date = fromUnixTime(dateValue);
    
    // 检查日期是否有效
    if (!isValid(date)) {
      return 'Invalid';
    }
    
    // 格式化为 YYYY/MM/DD HH:mm:ss
    return format(date, 'yyyy/MM/dd HH:mm:ss');
  } catch (error) {
    console.warn('Date formatting error:', error, 'Input:', dateValue);
    return 'Error';
  }
};
