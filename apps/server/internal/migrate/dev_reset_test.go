package migrate

import (
	"testing"

	"gbnt/apps/server/internal/model"
)

func TestProjectTableNamesMatchModels(t *testing.T) {
	t.Parallel()
	names := projectTableNames()
	if len(names) == 0 {
		t.Fatal("项目表列表不能为空")
	}
	comments := model.TableComments()
	seen := map[string]struct{}{}
	for _, name := range names {
		if _, dup := seen[name]; dup {
			t.Errorf("重复表名 %s", name)
		}
		seen[name] = struct{}{}
		if _, ok := comments[name]; !ok {
			t.Errorf("表 %s 未在 TableComments 中登记", name)
		}
	}
	for table := range comments {
		if _, ok := seen[table]; !ok {
			t.Errorf("TableComments 中的 %s 未纳入 projectModels，开发模式不会重建", table)
		}
	}
}
