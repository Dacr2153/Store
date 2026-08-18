package repository

import (
	"context"

	"github.com/kevintovar01/Store/models"
)

type Repository interface {
	// Crud for User
	InsertUser(ctx context.Context, user *models.User) error
	GetUserById(ctx context.Context, id string) (*models.User, error)
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)

	// Crud for product
	InsertProduct(ctx context.Context, product *models.Product) error
	GetProductById(ctx context.Context, id string) (*models.ProductList, error)
	UpdateProduct(ctx context.Context, product *models.Product) error
	DeleteProduct(ctx context.Context, id string, userId string) error
	ListProduct(ctx context.Context, filter models.ProductFilter) ([]*models.ProductList, error)
	InsertImage(ctx context.Context, image *models.Image) (string, error)
	LinkProductToImage(ctx context.Context, productID string, imageID string) error
	GetImageById(ctx context.Context, id string) (*models.Image, error)

	// Crud for wishcar
	CreateWishCar(ctx context.Context, wishCar *models.Car) error
	GetWishCarById(ctx context.Context, userId string) (*models.Car, error)
	UpdateWishCar(ctx context.Context, wishCar *models.Car) error
	AddItem(ctx context.Context, carItem *models.CarItem) error
	GetItem(ctx context.Context, productId string, carId string) (*models.CarItem, error)
	RemoveItem(ctx context.Context, productId string, carId string) error
	UpdateQuantity(ctx context.Context, productId string, quiantity int) error
	ListItems(ctx context.Context, userId string) ([]*models.CarItemDetail, error)

	// roles
	CreateRole(ctx context.Context, role *models.Role) error
	ListRoles(ctx context.Context) ([]*models.Role, error)
	GetRole(ctx context.Context, name string) (*models.Role, error)
	SetRoleUser(ctx context.Context, userId string, roleId int) error
	GetUserRoles(ctx context.Context, userId string) ([]string, error)

	//bussiness
	InsertUserBusiness(ctx context.Context, bussinessman *models.Bussinessman) error
	InsertUserWithBusiness(ctx context.Context, user *models.User, b *models.Bussinessman) error

	// orders
	CreateOrderFromCart(ctx context.Context, userId string, car *models.Car, items []*models.CarItem, notes string) (*models.Order, error)
	ListOrders(ctx context.Context, userId string) ([]*models.Order, error)
	GetOrderById(ctx context.Context, orderId string, userId string) (*models.Order, error)

	Close() error
}

var implementation Repository

func SetRepository(repository Repository) {
	implementation = repository
}

func InsertUser(ctx context.Context, user *models.User) error {
	return implementation.InsertUser(ctx, user)
}

func GetUserById(ctx context.Context, id string) (*models.User, error) {
	return implementation.GetUserById(ctx, id)
}

func GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	return implementation.GetUserByEmail(ctx, email)
}

func InsertProduct(ctx context.Context, product *models.Product) error {
	return implementation.InsertProduct(ctx, product)
}

func GetProductById(ctx context.Context, id string) (*models.ProductList, error) {
	return implementation.GetProductById(ctx, id)
}

func UpdateProduct(ctx context.Context, product *models.Product) error {
	return implementation.UpdateProduct(ctx, product)
}

func ListProduct(ctx context.Context, filter models.ProductFilter) ([]*models.ProductList, error) {
	return implementation.ListProduct(ctx, filter)
}

func DeleteProduct(ctx context.Context, id string, userId string) error {
	return implementation.DeleteProduct(ctx, id, userId)
}

func InsertImage(ctx context.Context, image *models.Image) (string, error) {
	return implementation.InsertImage(ctx, image)
}

func LinkProductToImage(ctx context.Context, productID string, imageID string) error {
	return implementation.LinkProductToImage(ctx, productID, imageID)
}

func GetImageById(ctx context.Context, id string) (*models.Image, error) {
	return implementation.GetImageById(ctx, id)
}

// functions from wishcar
func CreateWishCar(ctx context.Context, wishCar *models.Car) error {
	return implementation.CreateWishCar(ctx, wishCar)
}

func AddItem(ctx context.Context, carItem *models.CarItem) error {
	return implementation.AddItem(ctx, carItem)
}

func GetWishCarById(ctx context.Context, userId string) (*models.Car, error) {
	return implementation.GetWishCarById(ctx, userId)
}

func UpdateWishCar(ctx context.Context, wishCar *models.Car) error {
	return implementation.UpdateWishCar(ctx, wishCar)
}

func GetItem(ctx context.Context, productId string, carId string) (*models.CarItem, error) {
	return implementation.GetItem(ctx, productId, carId)
}

func RemoveItem(ctx context.Context, productId string, carId string) error {
	return implementation.RemoveItem(ctx, productId, carId)
}

func UpdateQuantity(ctx context.Context, productId string, quantity int) error {
	return implementation.UpdateQuantity(ctx, productId, quantity)
}

func ListItems(ctx context.Context, userId string) ([]*models.CarItemDetail, error) {
	return implementation.ListItems(ctx, userId)
}

// roles
func CreateRole(ctx context.Context, role *models.Role) error {
	return implementation.CreateRole(ctx, role)
}

func ListRoles(ctx context.Context) ([]*models.Role, error) {
	return implementation.ListRoles(ctx)
}

func GetRole(ctx context.Context, name string) (*models.Role, error) {
	return implementation.GetRole(ctx, name)
}

func SetRoleUser(ctx context.Context, userId string, roleId int) error {
	return implementation.SetRoleUser(ctx, userId, roleId)
}

func GetUserRoles(ctx context.Context, userId string) ([]string, error) {
	return implementation.GetUserRoles(ctx, userId)
}

// bussiness

func InsertUserBusiness(ctx context.Context, bussinessman *models.Bussinessman) error {
	return implementation.InsertUserBusiness(ctx, bussinessman)
}

func InsertUserWithBusiness(ctx context.Context, user *models.User, b *models.Bussinessman) error {
	return implementation.InsertUserWithBusiness(ctx, user, b)
}

func CreateOrderFromCart(ctx context.Context, userId string, car *models.Car, items []*models.CarItem, notes string) (*models.Order, error) {
	return implementation.CreateOrderFromCart(ctx, userId, car, items, notes)
}

func ListOrders(ctx context.Context, userId string) ([]*models.Order, error) {
	return implementation.ListOrders(ctx, userId)
}

func GetOrderById(ctx context.Context, orderId string, userId string) (*models.Order, error) {
	return implementation.GetOrderById(ctx, orderId, userId)
}

func Close() error {
	return implementation.Close()
}
