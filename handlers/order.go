package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/kevintovar01/Store/middleware"
	"github.com/kevintovar01/Store/models"
	"github.com/kevintovar01/Store/repository"
	"github.com/kevintovar01/Store/server"
)

type CreateOrderRequest struct {
	Notes string `json:"notes"`
}

func CreateOrderHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, err := middleware.TokenAuth(s, w, *r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		claims, ok := token.Claims.(*models.AppClaims)
		if !ok || !token.Valid {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		var req CreateOrderRequest
		_ = json.NewDecoder(r.Body).Decode(&req)

		car, err := repository.GetWishCarById(r.Context(), claims.UserId)
		if err != nil || car == nil || car.Id == "" {
			http.Error(w, "no active cart found", http.StatusBadRequest)
			return
		}

		items, err := repository.ListItems(r.Context(), claims.UserId)
		if err != nil || len(items) == 0 {
			http.Error(w, "cart is empty", http.StatusBadRequest)
			return
		}

		// CreateOrderFromCart still expects []*models.CarItem; convert from detail.
		carItems := make([]*models.CarItem, len(items))
		for i, it := range items {
			carItems[i] = &models.CarItem{Id: it.Id, CarId: it.CarId, ProductId: it.ProductId, Quantity: it.Quantity}
		}

		order, err := repository.CreateOrderFromCart(r.Context(), claims.UserId, car, carItems, req.Notes)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(order)
	}
}

func ListOrdersHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, err := middleware.TokenAuth(s, w, *r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		claims, ok := token.Claims.(*models.AppClaims)
		if !ok || !token.Valid {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		orders, err := repository.ListOrders(r.Context(), claims.UserId)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if orders == nil {
			orders = []*models.Order{}
		}
		json.NewEncoder(w).Encode(orders)
	}
}

func GetOrderHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, err := middleware.TokenAuth(s, w, *r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		claims, ok := token.Claims.(*models.AppClaims)
		if !ok || !token.Valid {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		params := mux.Vars(r)
		order, err := repository.GetOrderById(r.Context(), params["id"], claims.UserId)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if order == nil {
			http.Error(w, "order not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(order)
	}
}
