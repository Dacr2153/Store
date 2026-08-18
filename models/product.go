package models

import (
	"time"
)

type Product struct {
	Id          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Price       float64   `json:"price"`
	Stock       int       `json:"stock"`
	User_id     string    `json:"user_id"`
	CreatedAt   time.Time `json:"created_at"`
}

type ProductList struct {
	Id          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Price       float64   `json:"price"`
	Stock       int       `json:"stock"`
	User_id     string    `json:"user_id"`
	Url         string    `json:"url"`
	Images      []string  `json:"images"`
	CreatedAt   time.Time `json:"created_at"`
}
