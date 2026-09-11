-- 人员排序增量迁移：先备份 sys_users，再在明确选中的目标数据库中执行。
-- 仅新增 sort 列；历史人员统一默认 100，不改账号、密码、状态、权限或组织关联。
-- 可重复执行：已有 sort 列时只展示提示，不覆盖已配置的排序值。
-- 发布顺序：本脚本 -> 后端 -> 管理后台。不要用 debug/dev 模式启动后端来迁移业务库。
SET @gbnt_user_sort_ddl = IF(
  EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_users' AND COLUMN_NAME = 'sort'
  ),
  'SELECT ''sys_users.sort already exists; no changes applied'' AS migration_result',
  'ALTER TABLE `sys_users` ADD COLUMN `sort` INT NOT NULL DEFAULT 100 COMMENT ''排序号 越小越靠前'''
);
PREPARE gbnt_user_sort_migration FROM @gbnt_user_sort_ddl;
EXECUTE gbnt_user_sort_migration;
DEALLOCATE PREPARE gbnt_user_sort_migration;

SELECT TABLE_SCHEMA, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_users' AND COLUMN_NAME = 'sort';
