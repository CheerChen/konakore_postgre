import { getTags, getUserPreferences } from '../api';

// Tag类型常量定义
export const TAG_TYPES = {
  GENERAL: 0,
  ARTIST: 1,
  COPYRIGHT: 3,
  CHARACTER: 4,
  COMPANY: 6
};

// 相关度排序的权重配置
export const RELEVANCE_WEIGHTS = {
  ARTIST: 10.0,     // 画师 - 最重要，决定风格偏好 (提高权重)
  COPYRIGHT: 5.0,   // 版权 - 作品系列偏好 (提高权重)
  CHARACTER: 3.0,   // 角色 - 角色偏好 (提高权重)
  GENERAL: 0.2,     // 通用 - 基础属性，大幅降低权重避免刷分
  COMPANY: 2.0,     // 公司 - 提高权重
  OTHER: 1.0        // 其他类型
};

// GENERAL标签的限制配置
export const GENERAL_LIMITS = {
  MIN_LIKED_COUNT: 50,    // 只考虑被收藏50次以上的GENERAL标签
  MAX_CONTRIBUTION: 0.3,  // GENERAL标签最多贡献总分的30%
  MAX_TAGS: 10           // 每个post最多计算10个GENERAL标签
};

// TAGME标签列表 - 这些标签在计算相关度时会被完全忽略
export const TAGME_EXCLUDE_TAGS = [
  'tagme',                     // 通用tagme标签
  'tagme_(artist)',            // 画师未知标签
  'tagme_(character)',         // 角色未知标签
];

// 需要在排序中置底的标签列表 - 这些标签的posts会被排到最后
export const BOTTOM_PRIORITY_TAGS = [
  'no_humans',                 // 无人物
  'otoko_no_ko',                 // 男孩子
];

// 检查是否为需要排除的tagme类型标签
export const isTagmeTag = (tagName) => {
  // 直接匹配已知的tagme标签
  if (TAGME_EXCLUDE_TAGS.includes(tagName)) {
    return true;
  }
  
  // 模糊匹配其他tagme变体（以tagme开头或包含tagme_的异常标签）
  // if (tagName.startsWith('tagme_') || tagName.startsWith('tagme(') || 
  //     tagName.includes('tagme_') || tagName.endsWith('tagme')) {
  //   return true;
  // }
  
  return false;
};

// Tag类型对应的颜色映射
export const TAG_TYPE_COLORS = {
  [TAG_TYPES.GENERAL]: {
    backgroundColor: 'rgba(144, 202, 249, 0.2)',
    color: '#90caf9',
    border: '1px solid rgba(144, 202, 249, 0.3)',
    hoverColor: 'rgba(144, 202, 249, 0.3)'
  },
  [TAG_TYPES.ARTIST]: {
    backgroundColor: 'rgba(255, 87, 34, 0.25)',
    color: '#ff5722',
    border: '1px solid rgba(255, 87, 34, 0.4)',
    hoverColor: 'rgba(255, 87, 34, 0.35)'
  },
  [TAG_TYPES.COPYRIGHT]: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    color: '#4caf50',
    border: '1px solid rgba(76, 175, 80, 0.3)',
    hoverColor: 'rgba(76, 175, 80, 0.3)'
  },
  [TAG_TYPES.CHARACTER]: {
    backgroundColor: 'rgba(233, 30, 99, 0.25)',
    color: '#e91e63',
    border: '1px solid rgba(233, 30, 99, 0.4)',
    hoverColor: 'rgba(233, 30, 99, 0.35)'
  },
  [TAG_TYPES.COMPANY]: {
    backgroundColor: 'rgba(255, 193, 7, 0.25)',
    color: '#ffc107',
    border: '1px solid rgba(255, 193, 7, 0.4)',
    hoverColor: 'rgba(255, 193, 7, 0.35)'
  }
};

// 默认颜色（未知类型）
const DEFAULT_TAG_COLOR = {
  backgroundColor: 'rgba(233, 30, 99, 0.25)',
  color: '#e91e63',
  border: '1px solid rgba(233, 30, 99, 0.4)',
  hoverColor: 'rgba(233, 30, 99, 0.35)'
};

/**
 * 统一的标签管理器
 * 作为所有标签相关数据和逻辑的单一数据源
 */
class TagManager {
  constructor() {
    // 合并所有现有的全局状态
    this.state = {
      tags: new Set(),                    // 原 globalTagsCache
      tagInfo: new Map(),                 // 原 globalTagInfoCache  
      translations: null,                 // 原 globalTagTranslations
      translationObserver: null,          // MutationObserver实例
      userPreferences: null,              // 用户偏好数据
      preferencesLastFetch: null,         // 上次获取偏好数据的时间
      isFetchingPreferences: false,       // 防止重复请求用户偏好
      isFetchingTranslations: false,      // 防止重复请求翻译文件
    };
    
    // 事件监听器
    this.listeners = new Set();
  }

  // ===== 事件系统 =====
  
  /**
   * 订阅状态变化
   */
  subscribe(listener) {
    this.listeners.add(listener);
  }

  /**
   * 取消订阅
   */
  unsubscribe(listener) {
    this.listeners.delete(listener);
  }

  /**
   * 通知状态变化
   */
  notify(event) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.warn('Error in tag manager listener:', error);
      }
    });
  }

  // ===== 本地存储操作 =====

  /**
   * 从localStorage恢复缓存
   */
  loadFromStorage() {
    try {
      // 加载基础标签缓存
      const savedTags = localStorage.getItem('konakore_tags_cache');
      if (savedTags) {
        const tags = JSON.parse(savedTags);
        tags.forEach(tag => this.state.tags.add(tag));
      }

      // 加载标签信息缓存
      const savedTagInfo = localStorage.getItem('konakore_tag_info_cache');
      if (savedTagInfo) {
        const tagInfoData = JSON.parse(savedTagInfo);
        tagInfoData.forEach(([name, info]) => {
          this.state.tagInfo.set(name, info);
        });
      }

      this.notify({ type: 'storage-loaded', data: { tags: this.state.tags, tagInfo: this.state.tagInfo } });
    } catch (error) {
      console.warn('Failed to load tags from localStorage:', error);
    }
  }

  /**
   * 保存缓存到localStorage
   */
  saveToStorage() {
    try {
      // 保存基础标签缓存
      const tags = Array.from(this.state.tags);
      localStorage.setItem('konakore_tags_cache', JSON.stringify(tags));

      // 保存标签信息缓存
      const tagInfoData = Array.from(this.state.tagInfo.entries());
      localStorage.setItem('konakore_tag_info_cache', JSON.stringify(tagInfoData));
    } catch (error) {
      console.warn('Failed to save tags to localStorage:', error);
    }
  }

  /**
   * 清空标签缓存
   */
  clearCache() {
    this.state.tags.clear();
    this.state.tagInfo.clear();
    this.state.translations = null;
    
    try {
      localStorage.removeItem('konakore_tags_cache');
      localStorage.removeItem('konakore_tag_info_cache');
    } catch (error) {
      console.warn('Failed to clear tags from localStorage:', error);
    }

    this.notify({ type: 'cache-cleared' });
  }

  // ===== API 数据获取 =====

  /**
   * 从API获取并缓存tag信息
   */
  async fetchTagInfo(page = 1, limit = 100, liked = null) {
    try {
      const tagsData = await getTags(page, limit, liked);
      
      if (Array.isArray(tagsData)) {
        tagsData.forEach(tag => {
          if (tag.name) {
            this.state.tagInfo.set(tag.name, {
              type: tag.type,
              count: tag.count
            });
            // 同时更新基础标签缓存
            this.state.tags.add(tag.name);
          }
        });
        
        // 保存到localStorage
        this.saveToStorage();
        
        this.notify({ 
          type: 'tag-info-updated', 
          data: { 
            tagInfo: this.state.tagInfo, 
            tags: this.state.tags,
            newCount: tagsData.length 
          } 
        });
        
        return tagsData.length;
      }
    } catch (error) {
      console.warn('Failed to fetch tag info from API:', error);
    }
    return 0;
  }

  /**
   * 添加tags到缓存
   */
  addTagsToCache(tags) {
    let added = false;
    tags.forEach(tag => {
      if (!this.state.tags.has(tag)) {
        this.state.tags.add(tag);
        added = true;
      }
    });
    if (added) {
      this.saveToStorage();
      this.notify({ type: 'tags-added', data: tags });
    }
    return added;
  }

  // ===== 用户偏好管理 =====

  /**
   * 获取用户偏好数据
   * @param {boolean} forceRefresh - 是否强制刷新数据
   */
  async fetchUserPreferences(forceRefresh = false) {
    // 如果正在请求，则直接返回，避免重复
    if (this.state.isFetchingPreferences) {
      console.warn('Fetch user preferences already in progress.');
      return this.state.userPreferences;
    }

    try {
      // 检查是否需要刷新数据（缓存30分钟）
      const now = Date.now();
      const cacheTime = 30 * 60 * 1000; // 30分钟
      
      if (!forceRefresh && 
          this.state.userPreferences && 
          this.state.preferencesLastFetch && 
          (now - this.state.preferencesLastFetch) < cacheTime) {
        return this.state.userPreferences;
      }

      this.state.isFetchingPreferences = true; // 设置状态锁

      const preferences = await getUserPreferences();
      
      this.state.userPreferences = preferences;
      this.state.preferencesLastFetch = now;
      
      this.notify({ 
        type: 'user-preferences-updated', 
        data: preferences 
      });
      
      return preferences;
    } catch (error) {
      console.warn('Failed to fetch user preferences:', error);
      return null;
    } finally {
      this.state.isFetchingPreferences = false; // 释放状态锁
    }
  }

  /**
   * 计算单个post的相关度分数
   * @param {Object} post - post对象
   * @returns {number} 相关度分数
   */
  calculatePostRelevanceScore(post) {
    if (!this.state.userPreferences?.preferences_by_type) {
      return 0;
    }

    const preferences = this.state.userPreferences.preferences_by_type;
    
    // 从post中提取tags
    let postTags = [];
    if (post.raw_data?.tags && typeof post.raw_data.tags === 'string') {
      postTags = post.raw_data.tags.split(' ').filter(Boolean);
    }

    // 分别计算不同类型标签的分数
    let artistScore = 0;
    let copyrightScore = 0;
    let characterScore = 0;
    let generalScore = 0;
    let companyScore = 0;
    let otherScore = 0;

    // 收集GENERAL标签用于后续限制
    const generalMatches = [];

    // 为每个tag计算分数
    postTags.forEach(tagName => {
      // 排除tagme类型标签
      if (isTagmeTag(tagName)) {
        return; // tagme标签不参与分数计算
      }

      // 获取tag信息
      const tagInfo = this.state.tagInfo.get(tagName);
      if (!tagInfo) return;

      const tagType = tagInfo.type;
      let typeName = 'OTHER';
      let weight = RELEVANCE_WEIGHTS.OTHER;

      // 确定tag类型和权重
      switch (tagType) {
        case TAG_TYPES.GENERAL:
          typeName = 'GENERAL';
          weight = RELEVANCE_WEIGHTS.GENERAL;
          break;
        case TAG_TYPES.ARTIST:
          typeName = 'ARTIST';
          weight = RELEVANCE_WEIGHTS.ARTIST;
          break;
        case TAG_TYPES.COPYRIGHT:
          typeName = 'COPYRIGHT';
          weight = RELEVANCE_WEIGHTS.COPYRIGHT;
          break;
        case TAG_TYPES.CHARACTER:
          typeName = 'CHARACTER';
          weight = RELEVANCE_WEIGHTS.CHARACTER;
          break;
        case TAG_TYPES.COMPANY:
          typeName = 'COMPANY';
          weight = RELEVANCE_WEIGHTS.COMPANY;
          break;
      }

      // 查找用户对该tag的偏好
      const typePreferences = preferences[typeName];
      if (typePreferences) {
        const tagPreference = typePreferences.find(pref => pref.name === tagName);
        if (tagPreference) {
          // 计算分数：用户喜欢次数 * 类型权重 * 偏好比率加成
          const baseScore = tagPreference.liked_count * weight;
          const preferenceBonus = tagPreference.preference_ratio / 100; // 转换为小数
          const finalScore = baseScore * (1 + preferenceBonus);

          // 根据类型累加到对应分数
          switch (tagType) {
            case TAG_TYPES.ARTIST:
              artistScore += finalScore;
              break;
            case TAG_TYPES.COPYRIGHT:
              copyrightScore += finalScore;
              break;
            case TAG_TYPES.CHARACTER:
              characterScore += finalScore;
              break;
            case TAG_TYPES.COMPANY:
              companyScore += finalScore;
              break;
            case TAG_TYPES.GENERAL:
              // GENERAL标签需要额外限制
              if (tagPreference.liked_count >= GENERAL_LIMITS.MIN_LIKED_COUNT) {
                generalMatches.push({
                  score: finalScore,
                  tagName: tagName,
                  likedCount: tagPreference.liked_count
                });
              }
              break;
            default:
              otherScore += finalScore;
              break;
          }
        }
      }
    });

    // 处理GENERAL标签：按分数排序，取前N个，并限制总贡献
    generalMatches.sort((a, b) => b.score - a.score);
    const limitedGeneralMatches = generalMatches.slice(0, GENERAL_LIMITS.MAX_TAGS);
    limitedGeneralMatches.forEach(match => {
      generalScore += match.score;
    });

    // 计算核心分数（非GENERAL）
    const coreScore = artistScore + copyrightScore + characterScore + companyScore + otherScore;
    
    // 限制GENERAL分数不超过总分的指定比例
    const maxGeneralScore = coreScore * GENERAL_LIMITS.MAX_CONTRIBUTION / (1 - GENERAL_LIMITS.MAX_CONTRIBUTION);
    const finalGeneralScore = Math.min(generalScore, maxGeneralScore);

    // 计算最终分数：正分 + 限制后的GENERAL分
    const totalScore = coreScore + finalGeneralScore;

    // 确保分数不低于0
    const finalScore = Math.max(0, totalScore);

    return Math.round(finalScore * 100) / 100; // 保留两位小数
  }

  /**
   * 检查post是否包含任何置底优先级的标签
   * @param {Object} post - post对象
   * @returns {boolean} 是否包含置底标签
   */
  hasBottomPriorityTag(post) {
    if (post.raw_data?.tags && typeof post.raw_data.tags === 'string') {
      const postTags = post.raw_data.tags.split(' ').filter(Boolean);
      return BOTTOM_PRIORITY_TAGS.some(tag => postTags.includes(tag));
    }
    return false;
  }

  /**
   * 获取post中的置底优先级标签列表
   * @param {Object} post - post对象
   * @returns {Array} 包含的置底标签列表
   */
  getBottomPriorityTags(post) {
    if (post.raw_data?.tags && typeof post.raw_data.tags === 'string') {
      const postTags = post.raw_data.tags.split(' ').filter(Boolean);
      return BOTTOM_PRIORITY_TAGS.filter(tag => postTags.includes(tag));
    }
    return [];
  }

  /**
   * 对posts数组按相关度排序
   * @param {Array} posts - posts数组
   * @param {string} order - 排序方向 'desc' | 'asc'
   * @returns {Array} 排序后的posts数组
   */
  sortPostsByRelevance(posts, order = 'desc') {
    if (!posts?.length) return posts;
    
    // 确保有用户偏好数据
    if (!this.state.userPreferences) {
      console.warn('No user preferences loaded for relevance sorting');
      return posts;
    }

    // 计算每个post的相关度分数并排序
    const postsWithScores = posts.map(post => ({
      ...post,
      relevanceScore: this.calculatePostRelevanceScore(post),
      hasBottomPriority: this.hasBottomPriorityTag(post)
    }));

    // 排序：先按置底标签分组，再按相关度排序
    postsWithScores.sort((a, b) => {
      // 优先级1: 置底标签的posts永远排在后面
      if (a.hasBottomPriority !== b.hasBottomPriority) {
        return a.hasBottomPriority - b.hasBottomPriority;
      }
      
      // 优先级2: 在相同置底状态下，按相关度排序
      if (order === 'asc') {
        return a.relevanceScore - b.relevanceScore;
      } else {
        return b.relevanceScore - a.relevanceScore;
      }
    });

    // 调试信息：显示前5个post的分数
    if (postsWithScores.length > 0) {
      const topPosts = postsWithScores.slice(0, 5);
      console.log('🎯 相关度排序结果 (前5个):', topPosts.map(p => ({
        id: p.id,
        score: p.relevanceScore,
        hasBottomPriority: p.hasBottomPriority,
        bottomTags: this.getBottomPriorityTags(p),
        sample_tags: p.raw_data?.tags?.split(' ').slice(0, 3).join(', ')
      })));
      
      // 显示分数详细分解（仅第一个post）
      if (topPosts.length > 0) {
        const firstPost = topPosts[0];
        const postTags = firstPost.raw_data?.tags?.split(' ').filter(Boolean) || [];
        
        console.log('🔍 详细分数分解 (Post ' + firstPost.id + '):', {
          totalScore: firstPost.relevanceScore,
          hasBottomPriority: firstPost.hasBottomPriority,
          bottomTags: this.getBottomPriorityTags(firstPost),
          sampleTags: postTags.slice(0, 10).join(', ') || 'N/A'
        });
      }
    }

    return postsWithScores;
  }

  /**
   * 通用排序方法，让置底标签的posts在所有排序中都后置
   * @param {Array} posts - posts数组
   * @param {Function} compareFn - 比较函数
   * @returns {Array} 排序后的posts数组
   */
  sortPostsWithBottomPriorityLast(posts, compareFn) {
    if (!posts?.length) return posts;

    // 为每个post添加置底标签标记
    const postsWithFlags = posts.map(post => ({
      ...post,
      hasBottomPriority: this.hasBottomPriorityTag(post)
    }));

    // 排序：先按置底标签分组，再按自定义规则排序
    return postsWithFlags.sort((a, b) => {
      // 优先级1: 置底标签的posts永远排在后面
      if (a.hasBottomPriority !== b.hasBottomPriority) {
        return a.hasBottomPriority - b.hasBottomPriority;
      }
      
      // 优先级2: 在相同置底状态下，使用自定义比较函数
      return compareFn(a, b);
    });
  }

  // ===== 标签操作方法 =====

  /**
   * 获取tag的颜色信息
   */
  getTagColors(tagName) {
    const tagInfo = this.state.tagInfo.get(tagName);
    if (tagInfo && tagInfo.type !== undefined) {
      return TAG_TYPE_COLORS[tagInfo.type] || DEFAULT_TAG_COLOR;
    }
    return DEFAULT_TAG_COLOR;
  }

  /**
   * 获取tag的类型信息
   */
  getTagInfo(tagName) {
    return this.state.tagInfo.get(tagName) || null;
  }

  /**
   * 获取所有缓存的标签
   */
  getCachedTags() {
    return Array.from(this.state.tags);
  }

  /**
   * 从posts中提取标签
   */
  extractTagsFromPosts(posts) {
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
  }

  /**
   * 合并缓存标签和当前标签
   */
  mergeTagsWithCache(currentTags) {
    const cachedTags = this.getCachedTags();
    
    // 合并并去重：缓存的tags在前，当前页面新的tags在后
    const tagSet = new Set();
    
    // 先添加缓存中的tags
    cachedTags.forEach(tag => tagSet.add(tag));
    
    // 再添加当前页面的tags（如果不在缓存中）
    currentTags.forEach(tag => tagSet.add(tag));
    
    // 转换为数组并排序
    return Array.from(tagSet).sort();
  }

  // ===== 翻译系统 =====

  /**
   * 设置标签文本（添加翻译）
   */
  setTagText(selector, textEn, display) {
    const elements = document.querySelectorAll(selector);
    for (const item of elements) {
      const en = textEn?.(item) || item.textContent || item.innerHTML;
      const cn = this.state.translations?.[en];
      if (cn) {
        const newText = display?.(en, cn) || `${en} [${cn}]`;
        // 只更新文本内容，保持原有的样式和结构
        if (item.childNodes.length === 1 && item.childNodes[0].nodeType === Node.TEXT_NODE) {
          item.textContent = newText;
        } else {
          // 如果有复杂结构，只更新文本节点
          const textNode = Array.from(item.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
          if (textNode) {
            textNode.textContent = newText;
          }
        }
      }
    }
  }

  /**
   * 翻译页面中的标签
   */
  async translateElements() {
    try {
      // 检查是否已加载翻译数据
      if (!this.state.translations) {
        // 如果正在请求，则直接返回，避免重复
        if (this.state.isFetchingTranslations) {
          console.warn('Fetch translations already in progress.');
          return;
        }
        
        this.state.isFetchingTranslations = true; // 设置状态锁
        try {
          const response = await fetch("https://cdn.jsdelivr.net/gh/asadahimeka/yandere-masonry@main/src/data/all_tags_cn.min.json");
          if (response.ok) {
            this.state.translations = await response.json();
            this.notify({ type: 'translations-loaded', data: this.state.translations });
          } else {
            console.warn('Failed to load tag translations');
            return;
          }
        } finally {
          this.state.isFetchingTranslations = false; // 释放状态锁
        }
      }

      // 为 MUI Chip 组件中的标签添加翻译
      const textEn = (el) => {
        // 处理下划线转换
        return el.textContent?.replace(/\s+/g, "_") || el.textContent;
      };

      // 翻译 PhotoSwipe 弹窗中的标签（使用 data-tag 属性精确定位）
      this.setTagText('[data-tag]', textEn);
      
      // 翻译普通的标签 Chip 组件（只翻译带有 data-tag 属性的 Chip）
      this.setTagText('[data-tag] .MuiChip-label', textEn);
      
      // 翻译 PhotoSwipe 弹窗中标签区域的 Chip（通过父容器限制范围）
      this.setTagText('.hidden-caption-content [data-tag] .MuiChip-label', textEn);

      // 翻译搜索建议中的标签
      this.setTagText('[role="option"]', textEn);

    } catch (error) {
      console.warn('Error translating tags:', error);
    }
  }

  /**
   * 获取标签的翻译文本
   */
  getTagTranslation(tagName) {
    if (!this.state.translations) {
      return tagName;
    }
    
    const en = tagName.replace(/\s+/g, "_");
    const cn = this.state.translations[en];
    return cn ? `${en} [${cn}]` : tagName;
  }

  /**
   * 获取标签的中文翻译（仅中文部分）
   */
  getTagChinese(tagName) {
    if (!this.state.translations) {
      return null;
    }
    
    const en = tagName.replace(/\s+/g, "_");
    return this.state.translations[en] || null;
  }

  /**
   * 初始化标签翻译系统
   */
  async initTranslation() {
    try {
      // 预加载翻译数据
      await this.translateElements();
      
      // 设置定期检查和更新标签翻译
      if (this.state.translationObserver) {
        this.state.translationObserver.disconnect();
      }

      const observer = new MutationObserver((mutations) => {
        let shouldTranslate = false;
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            // 检查是否有新的标签元素被添加
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // 更精确地检查标签元素：只检查带有 data-tag 属性的元素或搜索选项
                const hasTagElements = node.querySelector?.('[data-tag], [role="option"]') || 
                                     node.matches?.('[data-tag], [role="option"]');
                if (hasTagElements) {
                  shouldTranslate = true;
                }
              }
            });
          }
        });
        
        if (shouldTranslate) {
          // 延迟执行翻译，避免频繁调用
          setTimeout(() => this.translateElements(), 100);
        }
      });

      // 开始观察DOM变化
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      this.state.translationObserver = observer;
      
      this.notify({ type: 'translation-initialized' });
      
      return observer;
    } catch (error) {
      console.warn('Failed to initialize tag translation:', error);
      return null;
    }
  }

  /**
   * 刷新翻译数据
   */
  async refreshTranslations() {
    this.state.translations = null;
    await this.translateElements();
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.state.translationObserver) {
      this.state.translationObserver.disconnect();
      this.state.translationObserver = null;
    }
    this.listeners.clear();
  }
}

// 单例模式
export const tagManager = new TagManager();
