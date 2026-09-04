package perm

// actionSatisfies 校验 module 下是否满足 target action（view 可被高阶 action 隐含）。
func actionSatisfies(grants map[string]map[string]bool, module, target string) bool {
	acts, ok := grants[module]
	if !ok {
		return false
	}
	if acts[target] {
		return true
	}
	if target != "view" {
		return false
	}
	for _, a := range []string{"create", "edit", "delete", "import", "export"} {
		if acts[a] {
			return true
		}
	}
	return false
}
