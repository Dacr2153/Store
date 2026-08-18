package models

type User struct {
	Id       string `json:"id"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type Bussinessman struct {
	User
	UserId      string `json:"user_id"`
	CompanyName string `json:"company_name"`
	CompanyId   string `json:"company_id"`
}
