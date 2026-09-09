package perm

import "testing"

func TestRegistryAuthFlags(t *testing.T) {
	t.Parallel()
	want := map[string][2]bool{
		"GET /api/health":              {false, false},
		"GET /api/auth/captcha":        {false, false},
		"POST /api/auth/login":         {false, true},
		"GET /api/auth/me":             {true, false},
		"POST /api/attachments/images": {true, false},
		"POST /api/app/auth/login":     {false, false},
		"GET /api/app/todos":           {true, false},
		"GET /api/app/regions/:id":     {true, false},
		"GET /api/issues":              {true, true},
		"GET /uploads/*filepath":       {false, false},
	}
	seen := map[string]Entry{}
	for _, e := range Registry {
		key := e.Method + " " + e.Path
		if _, ok := seen[key]; ok {
			t.Errorf("重复注册 %s", key)
		}
		seen[key] = e
	}
	for key, flags := range want {
		e, ok := seen[key]
		if !ok {
			t.Errorf("缺少目录项 %s", key)
			continue
		}
		if e.IsJWT != flags[0] || e.IsRBAC != flags[1] {
			t.Errorf("%s is_jwt=%v is_rbac=%v, want %v %v", key, e.IsJWT, e.IsRBAC, flags[0], flags[1])
		}
	}
}
