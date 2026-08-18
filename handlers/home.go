package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/kevintovar01/Store/server"
)

// serializamos a json
type HomeResponse struct {
	Message string `json:"message"`
	Status  bool   `json:"status"`
}

func HomeHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// le decimos al cliente que le estamos respondiendo un json, de esta forma el cliente puede interpetar los datos que estamos enviando
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(HomeResponse{
			Message: "Welcome to Store",
			Status:  true,
		})

	}

}
