// Package cachex 基于 patrickmn/go-cache 的进程内 TTL 缓存封装。
package cachex

import (
	"time"

	gocache "github.com/patrickmn/go-cache"
)

// Store 缓存存储。
type Store struct {
	c *gocache.Cache
}

// New 创建缓存；defaultExp 为未指定 TTL 时的默认过期，cleanup 为清理间隔。
func New(defaultExp, cleanup time.Duration) *Store {
	if defaultExp <= 0 {
		defaultExp = 5 * time.Minute
	}
	if cleanup <= 0 {
		cleanup = 10 * time.Minute
	}
	return &Store{c: gocache.New(defaultExp, cleanup)}
}

// Set 写入；ttl<=0 时使用创建时的默认过期。
func (s *Store) Set(key string, val interface{}, ttl time.Duration) {
	if s == nil || s.c == nil || key == "" {
		return
	}
	if ttl <= 0 {
		s.c.SetDefault(key, val)
		return
	}
	s.c.Set(key, val, ttl)
}

// Get 读取；不存在或过期返回 false。
func (s *Store) Get(key string) (interface{}, bool) {
	if s == nil || s.c == nil || key == "" {
		return nil, false
	}
	return s.c.Get(key)
}

// Delete 删除键。
func (s *Store) Delete(key string) {
	if s == nil || s.c == nil || key == "" {
		return
	}
	s.c.Delete(key)
}

// GetDelete 读取并删除（一次性消费）。
func (s *Store) GetDelete(key string) (interface{}, bool) {
	v, ok := s.Get(key)
	if ok {
		s.Delete(key)
	}
	return v, ok
}
