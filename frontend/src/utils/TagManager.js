import { getTags } from '../api';

// Tag类型常量定义
export const TAG_TYPES = {
  GENERAL: 0,
  ARTIST: 1,
  COPYRIGHT: 3,
  CHARACTER: 4,
  COMPANY: 6
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
        const response = await fetch("https://cdn.jsdelivr.net/gh/asadahimeka/yandere-masonry@main/src/data/all_tags_cn.min.json");
        if (response.ok) {
          this.state.translations = await response.json();
          this.notify({ type: 'translations-loaded', data: this.state.translations });
        } else {
          console.warn('Failed to load tag translations');
          return;
        }
      }

      // 为 MUI Chip 组件中的标签添加翻译
      const textEn = (el) => {
        // 处理下划线转换
        return el.textContent?.replace(/\s+/g, "_") || el.textContent;
      };

      // 翻译 PhotoSwipe 弹窗中的标签
      this.setTagText('[data-tag]', textEn);
      
      // 翻译普通的标签 Chip 组件
      this.setTagText('.MuiChip-label', textEn);

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
                const hasTagElements = node.querySelector?.('.MuiChip-label, [data-tag], [role="option"]');
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
