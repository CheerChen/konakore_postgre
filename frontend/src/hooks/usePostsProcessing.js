import { useMemo } from 'react';
import { tagManager } from '../utils/TagManager';

/**
 * 排序函数 — HomePage / FavoritesPage 共用
 */
function sortPosts(posts, sortOption) {
  return [...posts].sort((a, b) => {
    switch (sortOption) {
      case 'score':
        return (b.data.score || 0) - (a.data.score || 0);
      case 'id':
        return (b.id || 0) - (a.id || 0);
      case 'file_size':
        return (b.data.file_size || 0) - (a.data.file_size || 0);
      case 'resolution': {
        const aPixels = (a.data.width || 0) * (a.data.height || 0);
        const bPixels = (b.data.width || 0) * (b.data.height || 0);
        return bPixels - aPixels;
      }
      case 'waifu_pillow': {
        const aRatio = (a.data.width || 0) / (a.data.height || 1);
        const bRatio = (b.data.width || 0) / (b.data.height || 1);
        const aIsWaifu = aRatio > 2 ? 1 : 0;
        const bIsWaifu = bRatio > 2 ? 1 : 0;
        if (aIsWaifu !== bIsWaifu) return bIsWaifu - aIsWaifu;
        return bRatio - aRatio;
      }
      case 'shuffle': {
        const seedA = (a.id || 0) * 9301 + 49297;
        const seedB = (b.id || 0) * 9301 + 49297;
        return (seedA % 233280) - (seedB % 233280);
      }
      default:
        return 0;
    }
  });
}

/**
 * 排除标签过滤
 */
function filterByExcludedTags(posts, excludedTags) {
  if (!excludedTags.length) return posts;
  return posts.filter(post => {
    const tagsString = tagManager.getPostTagsString(post);
    if (!tagsString) return true;
    const postTags = tagsString.split(' ').filter(Boolean);
    return !excludedTags.some(t => postTags.includes(t));
  });
}

/**
 * 相关度阈值过滤
 */
function filterByRelevance(posts, threshold, postScoresMap) {
  if (threshold <= 0 || !postScoresMap.size) return posts;
  return posts.filter(post => (postScoresMap.get(post.id) || 0) >= threshold);
}

/**
 * 帖子分组（parent/child 合并显示）
 */
function groupPosts(posts) {
  const childrenByParent = new Map();
  const postById = new Map();

  posts.forEach(post => {
    postById.set(post.id, post);
    const parentId = post.data?.parent_id;
    if (parentId && parentId !== post.id) {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId).push(post);
    }
  });

  const hiddenIds = new Set();
  const groupMap = new Map();
  childrenByParent.forEach((children, parentId) => {
    if (postById.has(parentId)) {
      children.forEach(child => hiddenIds.add(child.id));
      groupMap.set(parentId, [postById.get(parentId), ...children]);
    }
  });

  const displayPosts = posts.filter(post => !hiddenIds.has(post.id));
  return { displayPosts, groupMap };
}

/**
 * 统一的帖子处理 hook
 *
 * @param {Object} options
 * @param {Array}  options.posts            - 原始帖子列表
 * @param {string} options.sortOption       - 排序方式
 * @param {Object} options.postsLikeState   - 本地收藏状态 { [postId]: boolean }
 * @param {Array}  options.excludedTags     - 排除的标签列表（默认 []）
 * @param {number} options.relevanceThreshold - 相关度阈值（默认 0）
 * @param {Map}    options.postScoresMap    - 帖子相关度分数 Map（默认空 Map）
 * @param {boolean} options.enableGrouping  - 是否启用分组（默认 false）
 */
export function usePostsProcessing({
  posts,
  sortOption,
  postsLikeState,
  excludedTags = [],
  relevanceThreshold = 0,
  postScoresMap = new Map(),
  enableGrouping = false,
}) {
  // 排除标签过滤统计
  const excludedCountOnPage = useMemo(() => {
    if (!posts?.length || !excludedTags.length) return 0;
    return posts.reduce((acc, post) => {
      const tagsString = tagManager.getPostTagsString(post);
      if (!tagsString) return acc;
      const postTags = tagsString.split(' ').filter(Boolean);
      return acc + (excludedTags.some(t => postTags.includes(t)) ? 1 : 0);
    }, 0);
  }, [posts, excludedTags]);

  // 相关度过滤统计
  const relevanceRemovedCount = useMemo(() => {
    if (!posts?.length || relevanceThreshold <= 0 || !postScoresMap.size) return 0;
    let removed = 0;
    posts.forEach(post => {
      if ((postScoresMap.get(post.id) || 0) < relevanceThreshold) removed++;
    });
    return removed;
  }, [posts, relevanceThreshold, postScoresMap]);

  // 主处理管线：合并 like 状态 → 排除标签 → 排序 → 相关度过滤
  const postsForGrid = useMemo(() => {
    if (!posts.length) return posts;

    // 合并本地收藏状态
    const merged = posts.map(post => ({
      ...post,
      liked: postsLikeState.hasOwnProperty(post.id)
        ? postsLikeState[post.id]
        : post.liked
    }));

    // 排除标签过滤
    const afterExclude = filterByExcludedTags(merged, excludedTags);

    // 排序
    const sorted = sortPosts(afterExclude, sortOption);

    // 相关度过滤
    return filterByRelevance(sorted, relevanceThreshold, postScoresMap);
  }, [posts, sortOption, postsLikeState, excludedTags, relevanceThreshold, postScoresMap]);

  // 分组
  const { displayPosts, groupMap } = useMemo(() => {
    if (!enableGrouping || !postsForGrid.length) {
      return { displayPosts: postsForGrid, groupMap: new Map() };
    }
    return groupPosts(postsForGrid);
  }, [postsForGrid, enableGrouping]);

  return {
    postsForGrid,
    displayPosts,
    groupMap,
    excludedCountOnPage,
    relevanceRemovedCount,
  };
}
