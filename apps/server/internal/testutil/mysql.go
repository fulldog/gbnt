package testutil

import (
	"os"
	"testing"

	driver "github.com/go-sql-driver/mysql"
	"github.com/google/uuid"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// NewIsolatedMySQL 仅在显式配置测试 DSN 时创建随机独立库；清理只删除本次创建的库，允许真实并发连接。
func NewIsolatedMySQL(t testing.TB) (*gorm.DB, string) {
	t.Helper()
	dsn := os.Getenv("GBNT_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("未配置隔离 MySQL")
	}
	cfg, err := driver.ParseDSN(dsn)
	if err != nil {
		t.Fatal("测试 DSN 无效")
	}
	cfg.DBName = ""
	admin, err := gorm.Open(mysql.Open(cfg.FormatDSN()), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal("连接隔离 MySQL 失败")
	}
	name := "gbnt_facility_test_" + uuid.NewString()[:8]
	if err := admin.Exec("CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin").Error; err != nil {
		t.Fatal(err)
	}
	cfg.DBName, cfg.ParseTime = name, true
	db, err := gorm.Open(mysql.Open(cfg.FormatDSN()), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal("连接新建测试库失败")
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(20)
	sqlDB.SetMaxIdleConns(20)
	t.Cleanup(func() {
		_ = sqlDB.Close()
		if err := admin.Exec("DROP DATABASE `" + name + "`").Error; err != nil {
			t.Error(err)
		}
		conn, _ := admin.DB()
		_ = conn.Close()
	})
	return db, name
}
