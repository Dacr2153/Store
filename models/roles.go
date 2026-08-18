package models

type Role struct {
	Id   int    `json:"id"`
	Name string `json:"name"`
}

type UserRole struct {
	UserId string `json:"user_id"`
	RoleId int    `json:"role_id"`
}
