package models

import "time"

type Image struct {
	UserId    string    `json:"user_id"`
	Url       string    `json:"url"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"creared_at"`
}

type ImageLink struct {
	ProductId string    `json:"product_id"`
	ImageId   string    `json:"image_id"`
	CreatedAt time.Time `json:"created_at"`
}
