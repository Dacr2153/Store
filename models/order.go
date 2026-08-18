package models

import "time"

type Order struct {
	Id        string      `json:"id"`
	UserId    string      `json:"user_id"`
	Status    string      `json:"status"`
	Total     float64     `json:"total"`
	Notes     string      `json:"notes,omitempty"`
	Items     []OrderItem `json:"items,omitempty"`
	CreatedAt time.Time   `json:"created_at"`
	UpdatedAt time.Time   `json:"updated_at"`
}

type OrderItem struct {
	Id        string  `json:"id"`
	OrderId   string  `json:"order_id"`
	ProductId string  `json:"product_id"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unit_price"`
}
