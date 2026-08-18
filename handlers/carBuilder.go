package handlers

import (
	"log"
	"net/http"

	"github.com/kevintovar01/Store/models"
	"github.com/kevintovar01/Store/repository"
	"github.com/segmentio/ksuid"
)

type carBuilder struct {
	car    *models.Car
	userId string
	r      *http.Request
}

// NewCarBuilder crea un nuevo builder para un carrito
func NewCarBuilder(userId string, r *http.Request) *carBuilder {
	return &carBuilder{
		userId: userId,
		car:    &models.Car{},
		r:      r,
	}
}

func (cb *carBuilder) LoadOrCreate() error {

	var err error
	cb.car, err = repository.GetWishCarById(cb.r.Context(), cb.userId)
	if err != nil {
		return err
	}
	if cb.car.Id == "" {
		log.Println("Se esta creando el carro")
		id, err := ksuid.NewRandom()
		if err != nil {
			return err
		}
		cb.car = models.NewCar(id.String(), cb.userId, 0)
		err = repository.CreateWishCar(cb.r.Context(), cb.car)
		if err != nil {
			return err
		}

		log.Println("car final creado: ", cb.car)
	}

	log.Println("car final creado: ", cb.car)
	return nil
}

func (cb *carBuilder) AddProduct(product_id string, quantity int) error {
	var carItem = &models.CarItem{}
	carItem, err := repository.GetItem(cb.r.Context(), product_id, cb.car.Id)
	if err != nil {
		return err
	}

	log.Println("el item es", carItem)
	if carItem.Id == "" {
		carItem := models.CarItem{
			CarId:     cb.car.Id,
			ProductId: product_id,
			Quantity:  quantity,
		}
		log.Println("el item es 2", carItem)
		err = repository.AddItem(cb.r.Context(), &carItem)
		if err != nil {
			return err
		}
		log.Println("el item es 3", carItem)
	} else {
		err = repository.UpdateQuantity(cb.r.Context(), product_id, quantity)
		if err != nil {
			return err
		}
	}
	priceItem, err := repository.GetProductById(cb.r.Context(), product_id)
	if err != nil {
		return err
	}
	cb.car.Total += float64(quantity) * float64(priceItem.Price)
	cb.UpdateTotal()
	return nil
}

func (cb *carBuilder) UpdateTotal() error {
	err := repository.UpdateWishCar(cb.r.Context(), cb.car)
	if err != nil {
		return err
	}
	return nil
}

func (cb *carBuilder) Build() *models.Car {
	return cb.car
}
