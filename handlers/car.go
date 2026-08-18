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

type MessageResponse struct {
	Message string `json:"message"`
}

type CarResponse struct {
	Id    string  `json:"id"`
	Total float64 `json:"total"`
}

type QuantityRequest struct {
	Quantity int `json:"quantity"`
}

func AddItemHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := mux.Vars(r)
		token, err := middleware.TokenAuth(s, w, *r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		if claim, ok := token.Claims.(*models.AppClaims); ok && token.Valid {

			var QuantityRequest *QuantityRequest
			if err := json.NewDecoder(r.Body).Decode(&QuantityRequest); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if QuantityRequest == nil || QuantityRequest.Quantity <= 0 {
				http.Error(w, "quantity must be greater than 0", http.StatusBadRequest)
				return
			}

			builder := NewCarBuilder(claim.UserId, r)
			if err := builder.LoadOrCreate(); err != nil {
				http.Error(w, "error loading cart: "+err.Error(), http.StatusInternalServerError)
				return
			}
			if err := builder.AddProduct(params["id"], QuantityRequest.Quantity); err != nil {
				http.Error(w, "error adding product: "+err.Error(), http.StatusInternalServerError)
				return
			}
			builder.Build()

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(&MessageResponse{
				Message: "item added",
			})
		} else {

			http.Error(w, "invalid token", http.StatusInternalServerError)
			return

		}
	}
}

func ListItemHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		// pageStr := r.URL.Query().Get("page")
		token, err := middleware.TokenAuth(s, w, *r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		//var page = uint64(0)
		// if pageStr != "" {
		// 	page, err = strconv.ParseUint(pageStr, 10, 64)
		// 	if err != nil {
		// 		http.Error(w, err.Error(), http.StatusBadRequest)
		// 		return
		// 	}
		// }

		if claim, ok := token.Claims.(*models.AppClaims); ok && token.Valid {
			carItem, err := repository.ListItems(r.Context(), claim.UserId)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			// Return empty array instead of null when cart is empty.
			if carItem == nil {
				carItem = []*models.CarItemDetail{}
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(carItem)
		} else {
			http.Error(w, "invalid token", http.StatusInternalServerError)
			return
		}
	}
}

func RemoveItemHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := mux.Vars(r)
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

		car, err := repository.GetWishCarById(r.Context(), claims.UserId)
		if err != nil || car.Id == "" {
			http.Error(w, "cart not found", http.StatusNotFound)
			return
		}

		err = repository.RemoveItem(r.Context(), params["id"], car.Id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(&MessageResponse{
			Message: "item removed",
		})
	}
}
