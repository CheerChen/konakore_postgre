// 全局tags缓存，只追加不删除
const globalTagsCache = new Set();

/**
 * 从localStorage恢复缓存
 */
export const loadTagsFromStorage = () => {
  try {
    const saved = localStorage.getItem('konakore_tags_cache');
    if (saved) {
      const tags = JSON.parse(saved);
      tags.forEach(tag => globalTagsCache.add(tag));
    }
  } catch (error) {
    console.warn('Failed to load tags from localStorage:', error);
  }
};

/**
 * 保存缓存到localStorage
 */
export const saveTagsToStorage = () => {
  try {
    const tags = Array.from(globalTagsCache);
    localStorage.setItem('konakore_tags_cache', JSON.stringify(tags));
  } catch (error) {
    console.warn('Failed to save tags to localStorage:', error);
  }
};

/**
 * 添加tags到缓存
 * @param {string[]} tags - 要添加的标签数组
 * @returns {boolean} 是否有新标签被添加
 */
export const addTagsToCache = (tags) => {
  let added = false;
  tags.forEach(tag => {
    if (!globalTagsCache.has(tag)) {
      globalTagsCache.add(tag);
      added = true;
    }
  });
  if (added) {
    saveTagsToStorage();
  }
  return added;
};

/**
 * 获取所有缓存的标签
 * @returns {string[]} 标签数组
 */
export const getCachedTags = () => {
  return Array.from(globalTagsCache);
};

/**
 * 清空标签缓存
 */
export const clearTagsCache = () => {
  globalTagsCache.clear();
  try {
    localStorage.removeItem('konakore_tags_cache');
  } catch (error) {
    console.warn('Failed to clear tags from localStorage:', error);
  }
};

/**
 * 从posts中提取标签
 * @param {Object[]} posts - 帖子数组
 * @returns {string[]} 提取的标签数组
 */
export const extractTagsFromPosts = (posts) => {
  if (!posts?.length) return [];
  
  const tagSet = new Set();
  posts.forEach(post => {
    // 检查两种可能的tags格式
    let tags = [];
    
    // 格式1: post.tags (数组)
    if (post.tags && Array.isArray(post.tags)) {
      tags = post.tags;
    }
    // 格式2: post.raw_data.tags (空格分隔的字符串)
    else if (post.raw_data?.tags && typeof post.raw_data.tags === 'string') {
      tags = post.raw_data.tags.split(' ').filter(Boolean);
    }
    
    // 添加到Set中去重
    tags.forEach(tag => {
      if (tag && typeof tag === 'string' && tag.trim().length > 0) {
        tagSet.add(tag.trim());
      }
    });
  });
  
  // 转换为数组并过滤空值
  return Array.from(tagSet).filter(tag => tag && tag.length > 0);
};

/**
 * 合并缓存标签和当前标签
 * @param {string[]} currentTags - 当前页面的标签
 * @returns {string[]} 合并后的标签数组（已排序）
 */
export const mergeTagsWithCache = (currentTags) => {
  const cachedTags = getCachedTags();
  
  // 合并并去重：缓存的tags在前，当前页面新的tags在后
  const tagSet = new Set();
  
  // 先添加缓存中的tags
  cachedTags.forEach(tag => tagSet.add(tag));
  
  // 再添加当前页面的tags（如果不在缓存中）
  currentTags.forEach(tag => tagSet.add(tag));
  
  // 转换为数组并排序
  return Array.from(tagSet).sort();
};
