package models

type ProductFilter struct {
	Search   string
	Category string
	MinPrice float64
	MaxPrice float64
	Page     uint64
}
