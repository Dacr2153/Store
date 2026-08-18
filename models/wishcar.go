package models

import "time"

type Car struct {
	Id        string    `json:"id"`
	UserId    string    `json:"user_id"`
	Total     float64   `json:"total"`
	CreatedAt time.Time `json:"created_at"`
}

type CarItem struct {
	Id        string `json:"id"`
	CarId     string `json:"car_id"`
	ProductId string `json:"product_id"`
	Quantity  int    `json:"quantity"`
}

// CarItemDetail is the enriched cart item returned to the frontend.
// It embeds CarItem and adds product fields needed for display.
type CarItemDetail struct {
	Id          string  `json:"id"`         // car_item row id
	ProductId   string  `json:"product_id"` // == Product.id used for add/remove ops
	CarId       string  `json:"car_id"`
	Quantity    int     `json:"quantity"`
	Name        string  `json:"name"`
	Price       float64 `json:"price"`
	Stock       int     `json:"stock"`
	Description string  `json:"description"`
	Url         string  `json:"url"` // first image path, e.g. /uploads/2025/01/foo.jpg
}

func NewCar(id string, userId string, total float64) *Car {
	return &Car{
		Id:     id,
		UserId: userId,
		Total:  total,
	}
}
