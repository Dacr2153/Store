package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/kevintovar01/Store/middleware"
	"github.com/kevintovar01/Store/models"
	"github.com/kevintovar01/Store/repository"
	"github.com/kevintovar01/Store/server"
)

type RoleRequest struct {
	Name string `json:"name"`
}

type MessageRoleResponse struct {
	Message string `json:"message"`
}

func CreateRoleHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var roleRequest = RoleRequest{}
		if err := json.NewDecoder(r.Body).Decode(&roleRequest); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		role := models.Role{
			Name: roleRequest.Name,
		}

		err := repository.CreateRole(r.Context(), &role)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(&role)

	}

}

func ListRolesHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		roles, err := repository.ListRoles(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		log.Println(roles)
		// w.header nos permite enviar una cabecera en la respuesta
		//content-type es el tipo de contenido que se esta enviando
		//application/json es el tipo de contenido que se esta enviando
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(roles)
	}
}

func GetRoleHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		if name == "" {
			http.Error(w, "name query parameter required", http.StatusBadRequest)
			return
		}
		role, err := repository.GetRole(r.Context(), name)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(role)
	}
}

func getRoleRequest(w http.ResponseWriter, r *http.Request) (*models.Role, error) {
	var roleRequest = RoleRequest{}
	if err := json.NewDecoder(r.Body).Decode(&roleRequest); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return nil, err
	}
	role, err := repository.GetRole(r.Context(), roleRequest.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return nil, err
	}

	return role, nil
}

func SetRoleUserHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, err := middleware.TokenAuth(s, w, *r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		if claims, ok := token.Claims.(*models.AppClaims); ok && token.Valid {
			role, err := getRoleRequest(w, r)
			if err != nil {
				return
			}
			err = repository.SetRoleUser(r.Context(), claims.UserId, role.Id)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "aplication/json")
			json.NewEncoder(w).Encode(&MessageRoleResponse{
				Message: "The user is now: " + role.Name,
			})
		} else {
			http.Error(w, "Invalid token", http.StatusInternalServerError)
			return
		}
	}
}

func GetUserRolesHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, err := middleware.TokenAuth(s, w, *r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		if claims, ok := token.Claims.(*models.AppClaims); ok && token.Valid {

			roles, err := repository.GetUserRoles(r.Context(), claims.UserId)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "aplication/json")
			json.NewEncoder(w).Encode(roles)
		} else {
			http.Error(w, "Invalid token", http.StatusInternalServerError)
			return
		}
	}
}
