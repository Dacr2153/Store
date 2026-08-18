package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"time"

	"github.com/golang-jwt/jwt/v4"
	internalauth "github.com/kevintovar01/Store/internal/auth"
	"github.com/kevintovar01/Store/internal/notify"
	"github.com/kevintovar01/Store/middleware"
	"github.com/kevintovar01/Store/models"
	"github.com/kevintovar01/Store/repository"
	"github.com/kevintovar01/Store/server"
	"github.com/segmentio/ksuid"
	"golang.org/x/crypto/bcrypt"
)

const (
	HASH_COST = 12
)

func validateEmail(email string) bool {
	re := regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	return re.MatchString(email)
}

func validatePassword(password string) bool {
	return len(password) >= 8
}

type SingUpLoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type SingUpResponse struct {
	Id    string `json:"id"`
	Email string `json:"email"`
}

type SingUpbussinesResponse struct {
	Id          string `json:"id"`
	Email       string `json:"email"`
	UserId      string `json:"user_id"`
	CompanyName string `json:"company_name"`
	CompanyId   string `json:"company_id"`
}

type LoginResponse struct {
	Token        string `json:"token"` // legacy alias of access_token (frontend compatibility)
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    int64  `json:"expires_at"`
}

func SingUpHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var request = SingUpLoginRequest{}
		err := json.NewDecoder(r.Body).Decode(&request)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if !validateEmail(request.Email) {
			http.Error(w, "invalid email format", http.StatusBadRequest)
			return
		}
		if !validatePassword(request.Password) {
			http.Error(w, "password must be at least 8 characters", http.StatusBadRequest)
			return
		}

		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(request.Password), HASH_COST) // Encriptacion de password
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		id, err := ksuid.NewRandom() // id aletorio.
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		var user = models.User{
			Email:    request.Email,
			Password: string(hashedPassword),
			Id:       id.String(),
		}

		err = repository.InsertUser(r.Context(), &user)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Issue verify_email token + enqueue welcome/verify email (best-effort).
		// Use detached background context so the goroutine outlives the request.
		go func(uid, email string) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			svc := internalauth.New(s.DB())
			tok, err := svc.IssueEmailToken(ctx, uid, internalauth.PurposeVerifyEmail, internalauth.EmailTokenTTL)
			if err != nil {
				return
			}
			frontURL := os.Getenv("FRONTEND_URL")
			if frontURL == "" {
				frontURL = "http://localhost:5173"
			}
			_ = notify.NewQueue(s.DB()).Enqueue(ctx, email, "verify_email", map[string]any{
				"verify_url": frontURL + "/auth/verify-email/" + tok,
			})
		}(user.Id, user.Email)

		w.Header().Set("Content-type", "application/json")
		json.NewEncoder(w).Encode(SingUpResponse{
			Id:    user.Id,
			Email: user.Email,
		})
	}
}

func LoginHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var request = SingUpLoginRequest{}
		// Decodifica el cuerpo del request entrante y lo almacena en la estructura request
		err := json.NewDecoder(r.Body).Decode(&request)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Obtiene el usuario por email desde el repositorio
		user, err := repository.GetUserByEmail(r.Context(), request.Email)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Verifica si el usuario existe
		if user.Id == "" {
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}

		// Compara la contraseña proporcionada con la almacenada en la base de datos
		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(request.Password)); err != nil {
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}

		// Crea los claims para el JWT (access token: 24h)
		claims := models.AppClaims{
			UserId: user.Id,
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(AccessTokenTTL)),
				IssuedAt:  jwt.NewNumericDate(time.Now()),
			},
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, err := token.SignedString([]byte(s.Config().JWTSecret))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Issue refresh token (7d).
		refresh, exp, err := internalauth.New(s.DB()).IssueRefresh(r.Context(), user.Id, r.UserAgent(), r.RemoteAddr)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("content-type", "application/json")
		json.NewEncoder(w).Encode(LoginResponse{
			Token:        tokenString, // legacy field for current frontend
			AccessToken:  tokenString,
			RefreshToken: refresh,
			ExpiresAt:    exp.Unix(),
		})

	}
}

func MyHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, err := middleware.TokenAuth(s, w, *r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		if claims, ok := token.Claims.(*models.AppClaims); ok && token.Valid {
			user, err := repository.GetUserById(r.Context(), claims.UserId)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			roles, err := repository.GetUserRoles(r.Context(), claims.UserId)
			if err != nil {
				roles = []string{}
			}
			if roles == nil {
				roles = []string{}
			}

			w.Header().Set("content-type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":    user.Id,
				"email": user.Email,
				"roles": roles,
			})

		} else {
			http.Error(w, "invalid token", http.StatusInternalServerError)
			return
		}
	}
}

func InsertUserBusinessHandler(s server.Server) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		var bussinessman = models.Bussinessman{}
		err := json.NewDecoder(r.Body).Decode(&bussinessman)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(bussinessman.Password), HASH_COST) // Encriptacion de password
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		id, err := ksuid.NewRandom() // id aletorio.
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		bussinessman = models.Bussinessman{
			User: models.User{
				Id:       id.String(),
				Email:    bussinessman.Email,
				Password: string(hashedPassword),
			},
			UserId:      id.String(),
			CompanyName: bussinessman.CompanyName,
			CompanyId:   bussinessman.CompanyId,
		}

		err = repository.InsertUserWithBusiness(r.Context(), &bussinessman.User, &bussinessman)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		role, err := repository.GetRole(r.Context(), "business")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		err = repository.SetRoleUser(r.Context(), bussinessman.User.Id, role.Id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SingUpbussinesResponse{
			Id:          bussinessman.Id,
			Email:       bussinessman.Email,
			UserId:      bussinessman.UserId,
			CompanyName: bussinessman.CompanyName,
			CompanyId:   bussinessman.CompanyId,
		})

	}
}

type UpdateProfileRequest struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
}

func UpdateProfileHandler(s server.Server) http.HandlerFunc {
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

		var req UpdateProfileRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":    claims.UserId,
			"name":  req.Name,
			"phone": req.Phone,
		})
	}
}
