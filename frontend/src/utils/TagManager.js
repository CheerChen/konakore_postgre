import { getTags, getRelevanceWeights } from '../api';

// Tag类型常量定义
export const TAG_TYPES = {
  GENERAL: 0,
  ARTIST: 1,
  COPYRIGHT: 3,
  CHARACTER: 4,
  COMPANY: 6
};

// TF-IDF混合排序的权重配置
export const TFIDF_HYBRID_CONFIG = {
  profileWeight: 0.8,    // TF-IDF分数权重
  qualityWeight: 0.15,   // 质量分数权重 
  curationWeight: 0.05,  // 策展分数权重
  curationMap: {
    's': 1.0,  // Safe
    'q': 0.9,  // Questionable  
    'e': 0.7   // Explicit
  },
  typeWeights: {
    [TAG_TYPES.GENERAL]: 0.4,   // General
    [TAG_TYPES.ARTIST]: 3.0,    // Artist
    [TAG_TYPES.COPYRIGHT]: 2.5, // Copyright/series
    [TAG_TYPES.CHARACTER]: 2.0, // Character
    5: 0.1,                     // Meta (type 5)
    [TAG_TYPES.COMPANY]: 2.0    // Brand/studio
  }
};

// TAGME标签列表 - 这些标签在计算时会被完全忽略
export const TAGME_EXCLUDE_TAGS = [
  'tagme',                     // 通用tagme标签
  'tagme_(artist)',            // 画师未知标签
  'tagme_(character)',         // 角色未知标签
];

// 排除标签设置：包含这些标签的 post 会被直接过滤掉
// 该配置可在 UI（Modal）中编辑，并持久化到 localStorage
export const DEFAULT_EXCLUDED_POST_TAGS = [
  // 示例：
  // 'no_humans',
];

const EXCLUDED_POST_TAGS_STORAGE_KEY = 'konakore_excluded_post_tags_config';
const RELEVANCE_FILTER_STORAGE_KEY = 'konakore_relevance_filter_config';

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
      preferencesLastFetch: null,         // 上次获取偏好数据的时间（已废弃，保留兼容）
      relevanceWeights: null,             // 后端计算的 TF-IDF weight map
      relevanceWeightsLastFetch: null,    // 上次获取 weights 的时间
      isFetchingWeights: false,           // 防止重复请求 weights
      isFetchingTranslations: false,      // 防止重复请求翻译文件

      excludedPostTagsConfig: {
        tags: [...DEFAULT_EXCLUDED_POST_TAGS]
      },

      relevanceFilterConfig: {
        threshold: 0,
      },
    };

    // 事件监听器
    this.listeners = new Set();

    // 尝试从 localStorage 恢复配置
    this.loadExcludedPostTagsConfigFromStorage();
    this.loadRelevanceFilterConfigFromStorage();
  }

  // ===== 排除标签设置（localStorage） =====

  loadExcludedPostTagsConfigFromStorage() {
    try {
      const raw = localStorage.getItem(EXCLUDED_POST_TAGS_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const tags = Array.isArray(parsed?.tags)
        ? parsed.tags.filter(t => typeof t === 'string' && t.trim().length > 0).map(t => t.trim())
        : [...DEFAULT_EXCLUDED_POST_TAGS];

      this.state.excludedPostTagsConfig = { tags };
      this.notify({ type: 'excluded-tags-config-loaded', data: this.state.excludedPostTagsConfig });
    } catch (error) {
      console.warn('Failed to load excluded post tags config from localStorage:', error);
    }
  }

  saveExcludedPostTagsConfigToStorage() {
    try {
      localStorage.setItem(
        EXCLUDED_POST_TAGS_STORAGE_KEY,
        JSON.stringify(this.state.excludedPostTagsConfig)
      );
    } catch (error) {
      console.warn('Failed to save excluded post tags config to localStorage:', error);
    }
  }

  getExcludedPostTagsConfig() {
    return this.state.excludedPostTagsConfig;
  }

  setExcludedPostTagsConfig(nextConfig) {
    const tags = Array.isArray(nextConfig?.tags)
      ? nextConfig.tags.filter(t => typeof t === 'string' && t.trim().length > 0).map(t => t.trim())
      : [];

    this.state.excludedPostTagsConfig = { tags };
    this.saveExcludedPostTagsConfigToStorage();
    this.notify({ type: 'excluded-tags-config-updated', data: this.state.excludedPostTagsConfig });
  }

  // ===== 相关度过滤配置（localStorage） =====

  loadRelevanceFilterConfigFromStorage() {
    try {
      const raw = localStorage.getItem(RELEVANCE_FILTER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.state.relevanceFilterConfig = {
        threshold: Number(parsed?.threshold) || 0,
      };
    } catch (error) {
      console.warn('Failed to load relevance filter config:', error);
    }
  }

  saveRelevanceFilterConfigToStorage() {
    try {
      localStorage.setItem(
        RELEVANCE_FILTER_STORAGE_KEY,
        JSON.stringify(this.state.relevanceFilterConfig)
      );
    } catch (error) {
      console.warn('Failed to save relevance filter config:', error);
    }
  }

  getRelevanceFilterConfig() {
    return this.state.relevanceFilterConfig;
  }

  setRelevanceFilterConfig(nextConfig) {
    this.state.relevanceFilterConfig = {
      threshold: Number(nextConfig?.threshold) || 0,
    };
    this.saveRelevanceFilterConfigToStorage();
    this.notify({ type: 'relevance-filter-config-updated', data: this.state.relevanceFilterConfig });
  }

  // ===== Post 过滤 =====

  getPostTagsString(post) {
    if (post?.raw_data?.tags && typeof post.raw_data.tags === 'string') return post.raw_data.tags;
    if (post?.data?.tags && typeof post.data.tags === 'string') return post.data.tags;
    if (typeof post?.tags === 'string') return post.tags;
    return null;
  }

  shouldExcludePost(post) {
    const { tags: excludedTags } = this.state.excludedPostTagsConfig || {};
    if (!Array.isArray(excludedTags) || excludedTags.length === 0) return false;

    const tagsString = this.getPostTagsString(post);
    if (!tagsString) return false;

    const postTags = tagsString.split(' ').filter(Boolean);
    return excludedTags.some(tag => postTags.includes(tag));
  }

  filterPosts(posts) {
    if (!Array.isArray(posts) || posts.length === 0) return posts;
    return posts.filter(post => !this.shouldExcludePost(post));
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
   * 从后端获取 TF-IDF 权重（替代前端 learnTfIdf）
   * @param {boolean} forceRefresh - 是否强制刷新
   * @returns {Map} tag -> weight 权重映射
   */
  async fetchRelevanceWeights(forceRefresh = false) {
    if (this.state.isFetchingWeights) {
      return this.state.relevanceWeights;
    }

    const now = Date.now();
    const cacheTime = 30 * 60 * 1000; // 30 minutes

    if (!forceRefresh &&
      this.state.relevanceWeights &&
      this.state.relevanceWeightsLastFetch &&
      (now - this.state.relevanceWeightsLastFetch) < cacheTime) {
      return this.state.relevanceWeights;
    }

    try {
      this.state.isFetchingWeights = true;
      const response = await getRelevanceWeights();

      // Convert plain object to Map
      const weightMap = new Map(Object.entries(response.weights).map(
        ([tag, weight]) => [tag, weight]
      ));

      this.state.relevanceWeights = weightMap;
      this.state.relevanceWeightsLastFetch = now;

      console.log(`✅ Loaded ${weightMap.size} relevance weights from backend`);

      return weightMap;
    } catch (error) {
      console.warn('Failed to fetch relevance weights:', error);
      return this.state.relevanceWeights || new Map();
    } finally {
      this.state.isFetchingWeights = false;
    }
  }

  /**
   * 计算单个 post 的相关度分数
   * @param {Object} post - post 对象
   * @param {Map} weightMap - learnTfIdf 返回的权重映射
   * @returns {number} 相关度分数（SUM of weights）
   */
  scorePost(post, weightMap) {
    const tagsString = post.data?.tags ?? post.tags ?? '';
    if (typeof tagsString !== 'string') return 0;

    const tags = tagsString.split(' ').filter(Boolean);
    return tags.reduce((sum, tag) => sum + (weightMap.get(tag) || 0), 0);
  }

  sortPosts(posts, compareFn) {
    if (!posts?.length) return posts;
    const filteredPosts = this.filterPosts(posts);
    if (!filteredPosts?.length) return filteredPosts;
    return filteredPosts.sort(compareFn);
  }

  /**
   * 检查post是否包含任何置底优先级的标签
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
      // 格式2: post.data.tags (空格分隔的字符串)
      else if (post.data?.tags && typeof post.data.tags === 'string') {
        tags = post.data.tags.split(' ').filter(Boolean);
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
