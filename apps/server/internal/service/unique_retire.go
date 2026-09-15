package service

import (
	"fmt"

	"gorm.io/gorm"
)

func retireUniqueValue(value string, id uint64, max int) string {
	suffix := fmt.Sprintf("#d%d", id)
	if max <= len(suffix) {
		return suffix
	}
	keep := max - len(suffix)
	runes := []rune(value)
	if len(runes) > keep {
		runes = runes[:keep]
	}
	return string(runes) + suffix
}

func retireUniqueColumn(tx *gorm.DB, model any, id uint64, column, value string, max int) error {
	if tx == nil || id == 0 || column == "" {
		return nil
	}
	return tx.Model(model).Where("id = ?", id).Update(column, retireUniqueValue(value, id, max)).Error
}
