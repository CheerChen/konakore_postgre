/**
 * 处理图片 URL，将 konachan.com 转换为代理路径
 * @param {string} url - 原始图片URL
 * @returns {string} 处理后的图片URL
 */
export const getImageUrl = (url) => {
  if (!url) return 'https://via.placeholder.com/300';

  const konachanUrl = url.replace('konachan.com', 'konachan.net');
  return konachanUrl.replace('https://konachan.net', '/konachan-proxy');
};



/**
 * 检查图片是否为 waifu pillow 格式（宽高比 > 2）
 * @param {number} width - 图片宽度
 * @param {number} height - 图片高度
 * @returns {boolean} 是否为 waifu pillow 格式
 */
export const isWaifuPillow = (width, height) => {
  if (!width || !height) return false;
  return (width / height) > 2;
};

/**
 * 计算图片宽高比
 * @param {number} width - 图片宽度
 * @param {number} height - 图片高度
 * @returns {number} 宽高比
 */
export const getAspectRatio = (width, height) => {
  if (!height || height === 0) return 0;
  return width / height;
};

/**
 * 获取图片尺寸显示文本
 * @param {Object} rawData - 图片原始数据
 * @returns {string} 尺寸显示文本
 */
export const getImageDimensionsText = (rawData) => {
  if (!rawData) return 'N/A';

  const { width, height, jpeg_width, jpeg_height, jpeg_file_size } = rawData;

  if (jpeg_file_size === 0) {
    return `${width}x${height}`;
  } else {
    return `${jpeg_width}x${jpeg_height} / ${width}x${height}`;
  }
};
