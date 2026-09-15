package service

import (
	"context"
	"sync"

	"gorm.io/gorm"

	"gbnt/apps/server/internal/cachex"
	"gbnt/apps/server/internal/model"
)

type orgCacheCtxKey struct{}
type orgMemoCtxKey struct{}

type orgMemo struct {
	once sync.Once
	list []model.SysOrg
	err  error
}

// WithOrgLookup 为请求挂上组织列表缓存与单次加载备忘，避免同一请求反复查 sys_orgs。
func WithOrgLookup(ctx context.Context, cache *cachex.Store) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	ctx = context.WithValue(ctx, orgCacheCtxKey{}, cache)
	if ctx.Value(orgMemoCtxKey{}) == nil {
		ctx = context.WithValue(ctx, orgMemoCtxKey{}, &orgMemo{})
	}
	return ctx
}

func orgCacheFrom(ctx context.Context) *cachex.Store {
	if ctx == nil {
		return nil
	}
	c, _ := ctx.Value(orgCacheCtxKey{}).(*cachex.Store)
	return c
}

// loadOrgCatalog 优先请求内备忘，其次 sys_orgs:list 进程缓存，最后查库。
func loadOrgCatalog(ctx context.Context, db *gorm.DB) ([]model.SysOrg, error) {
	if memo, ok := ctx.Value(orgMemoCtxKey{}).(*orgMemo); ok && memo != nil {
		memo.once.Do(func() {
			memo.list, memo.err = fetchOrgCatalog(ctx, db)
		})
		if memo.err != nil {
			return nil, memo.err
		}
		return cloneSysOrgs(memo.list), nil
	}
	return fetchOrgCatalog(ctx, db)
}

func fetchOrgCatalog(ctx context.Context, db *gorm.DB) ([]model.SysOrg, error) {
	if cache := orgCacheFrom(ctx); cache != nil {
		if v, ok := cache.Get(cacheKeySysOrgs); ok {
			if list, ok := v.([]model.SysOrg); ok {
				return cloneSysOrgs(list), nil
			}
		}
	}
	var list []model.SysOrg
	q := db
	if ctx != nil {
		q = db.WithContext(ctx)
	}
	if err := q.Order("sort ASC, id ASC").Find(&list).Error; err != nil {
		return nil, err
	}
	if cache := orgCacheFrom(ctx); cache != nil {
		cache.Set(cacheKeySysOrgs, cloneSysOrgs(list), cachex.NoExpiration)
	}
	return cloneSysOrgs(list), nil
}
