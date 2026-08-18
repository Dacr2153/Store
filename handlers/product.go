package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/kevintovar01/Store/internal/imgutil"
	"github.com/kevintovar01/Store/middleware"
	"github.com/kevintovar01/Store/models"
	"github.com/kevintovar01/Store/repository"
	"github.com/kevintovar01/Store/server"
	"github.com/segmentio/ksuid"
)

type UpsertProductRequest struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
	Stock       int     `json:"stock"`
}

type ProductUpdateResponse struct {
	Message string `json:"message"`
}

type ProductResponse struct {
	Id    string  `json:"id"`
	Name  string  `json:"name"`
	Price float64 `json:"price"`
	Stock int     `json:"stock"`
}

type GetProductResponse struct {
	Id          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Price       float64   `json:"price"`
	Stock       int       `json:"stock"`
	User_id     string    `json:"user_id"`
	CreatedAt   time.Time `json:"created_at"`
	Url         string    `json:"url"`
	Images      []string  `json:"images"`
}

func InsertProductHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, err := middleware.TokenAuth(s, w, *r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		if claim, ok := token.Claims.(*models.AppClaims); ok && token.Valid {
			var productRequest = UpsertProductRequest{}
			if err := json.NewDecoder(r.Body).Decode(&productRequest); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			if productRequest.Name == "" {
				http.Error(w, "product name is required", http.StatusBadRequest)
				return
			}
			if productRequest.Price <= 0 {
				http.Error(w, "price must be greater than 0", http.StatusBadRequest)
				return
			}
			if productRequest.Stock < 0 {
				http.Error(w, "stock cannot be negative", http.StatusBadRequest)
				return
			}

			id, err := ksuid.NewRandom()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			product := models.Product{
				Id:          id.String(),
				Name:        productRequest.Name,
				Description: productRequest.Description,
				Price:       productRequest.Price,
				Stock:       productRequest.Stock,
				User_id:     claim.UserId,
			}

			err = repository.InsertProduct(r.Context(), &product)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			var productMessage = models.WebsocketMessage{
				Type:    "Product created",
				Payload: &product,
			}
			s.Hub().Broadcast(productMessage, nil)

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(&ProductResponse{
				Id:    id.String(),
				Name:  productRequest.Name,
				Price: productRequest.Price,
				Stock: productRequest.Stock,
			})
		} else {
			http.Error(w, "invalid token", http.StatusInternalServerError)
			return
		}
	}
}

func UpdateProductHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, err := middleware.TokenAuth(s, w, *r)
		params := mux.Vars(r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		if claim, ok := token.Claims.(*models.AppClaims); ok && token.Valid {
			var productRequest = UpsertProductRequest{}
			if err := json.NewDecoder(r.Body).Decode(&productRequest); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			product := models.Product{
				Id:          params["id"],
				Name:        productRequest.Name,
				Description: productRequest.Description,
				Price:       productRequest.Price,
				Stock:       productRequest.Stock,
				User_id:     claim.UserId,
			}

			err = repository.UpdateProduct(r.Context(), &product)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			var productMessage = models.WebsocketMessage{
				Type:    "Product created",
				Payload: &product,
			}
			s.Hub().Broadcast(productMessage, nil)

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(&ProductUpdateResponse{
				Message: "Product updated",
			})
		} else {
			http.Error(w, "invalid token", http.StatusInternalServerError)
			return
		}
	}
}

func GetProductByIdHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := mux.Vars(r)
		log.Println(params["id"])
		product, err := repository.GetProductById(r.Context(), params["id"])
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(&GetProductResponse{
			Id:          product.Id,
			Name:        product.Name,
			Description: product.Description,
			Price:       product.Price,
			Stock:       product.Stock,
			User_id:     product.User_id,
			CreatedAt:   product.CreatedAt,
			Url:         product.Url,
			Images:      product.Images})
	}
}

func DeleteProductHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, err := middleware.TokenAuth(s, w, *r)
		params := mux.Vars(r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		if claims, ok := token.Claims.(*models.AppClaims); ok && token.Valid {
			err := repository.DeleteProduct(r.Context(), params["id"], claims.UserId)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(&ProductUpdateResponse{
				Message: "Product deleted",
			})
		} else {
			http.Error(w, "Invalid token", http.StatusInternalServerError)
			return
		}

	}
}

func ListProductHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()

		var page uint64
		if pageStr := q.Get("page"); pageStr != "" {
			if p, err := strconv.ParseUint(pageStr, 10, 64); err == nil {
				page = p
			}
		}

		var minPrice, maxPrice float64
		if v := q.Get("minPrice"); v != "" {
			minPrice, _ = strconv.ParseFloat(v, 64)
		}
		if v := q.Get("maxPrice"); v != "" {
			maxPrice, _ = strconv.ParseFloat(v, 64)
		}

		filter := models.ProductFilter{
			Search:   q.Get("search"),
			Category: q.Get("category"),
			MinPrice: minPrice,
			MaxPrice: maxPrice,
			Page:     page,
		}

		products, err := repository.ListProduct(r.Context(), filter)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if products == nil {
			products = []*models.ProductList{}
		}
		json.NewEncoder(w).Encode(products)
	}
}

func InsertImageHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := mux.Vars(r)
		token, err := middleware.TokenAuth(s, w, *r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		if claims, ok := token.Claims.(*models.AppClaims); ok && token.Valid {
			r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
			if err := r.ParseMultipartForm(10 << 20); err != nil {
				http.Error(w, "file too large (max 10MB)", http.StatusBadRequest)
				return
			}

			file, header, err := r.FormFile("image")
			if err != nil {
				http.Error(w, "Error with the file", http.StatusBadRequest)
				return
			}
			defer file.Close()

			ext := strings.ToLower(filepath.Ext(header.Filename))
			allowedExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true}
			if !allowedExts[ext] {
				http.Error(w, "file type not allowed", http.StatusBadRequest)
				return
			}

			// guardar ruta en el servidor (always as .webp for maximum compression)
			now := time.Now()
			folderPath := fmt.Sprintf("./uploads/%d/%02d/%02d", now.Year(), now.Month(), now.Day())
			err = os.MkdirAll(folderPath, os.ModePerm)
			if err != nil {
				http.Error(w, "Error to create de folder", http.StatusInternalServerError)
				return
			}

			safeFilename := ksuid.New().String() + ".webp"
			filePath := filepath.Join(folderPath, safeFilename)
			destFile, err := os.Create(filePath)
			if err != nil {
				http.Error(w, "Error to save the file", http.StatusInternalServerError)
				return
			}
			defer destFile.Close()

			contentType := header.Header.Get("Content-Type")
			if err = imgutil.CompressToWebP(destFile, file, contentType); err != nil {
				log.Printf("imgutil.CompressToWebP: %v", err)
				http.Error(w, "Error processing the image", http.StatusInternalServerError)
				return
			}

			// stat the resulting file to record the actual compressed size
			fi, err := destFile.Stat()
			if err != nil {
				fi = nil
			}
			var compressedSize int64
			if fi != nil {
				compressedSize = fi.Size()
			}

			url := fmt.Sprintf("/uploads/%d/%02d/%02d/%s", now.Year(), now.Month(), now.Day(), safeFilename)
			image := models.Image{
				UserId: claims.UserId,
				Url:    url,
				Name:   header.Filename,
				Type:   "image/webp",
				Size:   compressedSize,
			}

			log.Println(image)

			imageID, err := repository.InsertImage(r.Context(), &image)
			if err != nil {
				http.Error(w, "Error to upload the image", http.StatusInternalServerError)
				return
			}

			err = repository.LinkProductToImage(r.Context(), params["id"], imageID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(&ProductUpdateResponse{
				Message: "Image upload",
			})
		} else {
			http.Error(w, "invalid token", http.StatusInternalServerError)
		}
	}
}
