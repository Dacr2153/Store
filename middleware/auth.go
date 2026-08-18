package middleware

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v4"
	"github.com/kevintovar01/Store/models"
	"github.com/kevintovar01/Store/repository"
	"github.com/kevintovar01/Store/server"
)

var (
	_ = struct{}{} // keep var block for future use
)

// se itera sobre las rutas que no necesitan autenticacion
func shouldCheckToken(route string) bool {
	exactMatch := map[string]bool{
		"/signup":               true,
		"/signupBusiness":       true,
		"/login":                true,
		"/":                     true,
		"/health":               true,
		"/auth/refresh":         true,
		"/auth/verify-email":    true,
		"/auth/forgot-password": true,
		"/auth/reset-password":  true,
		"/auth/google/login":    true,
		"/auth/google/callback": true,
	}
	if exactMatch[route] {
		return false
	}
	if strings.HasPrefix(route, "/uploads/") {
		return false
	}
	if route == "/docs" || strings.HasPrefix(route, "/api/") {
		return false
	}
	if route == "/metrics" {
		return false
	}
	// Catalog public reads (Phase D)
	if route == "/products" ||
		route == "/categories/tree" ||
		strings.HasPrefix(route, "/categories/") ||
		route == "/search" || route == "/search/suggest" ||
		route == "/search/smart" || route == "/search/benchmark" {
		return false
	}
	// Public GET /products/{id}; method-aware gating for write operations is
	// enforced separately by RoleProxy on the corresponding routes.
	if strings.HasPrefix(route, "/products/") {
		rest := strings.TrimPrefix(route, "/products/")
		if rest != "" && !strings.Contains(rest, "/") {
			return false
		}
	}
	if strings.HasPrefix(route, "/products/") && (strings.HasSuffix(route, "/variants") || strings.HasSuffix(route, "/related")) {
		// allow public GET; POST is gated by RoleProxy middleware itself.
		return false
	}
	// Public review listing (POST gated by handler)
	if strings.HasPrefix(route, "/products/") && strings.HasSuffix(route, "/reviews") {
		return false
	}
	// Public recommendations (Phase N)
	if route == "/products/recently-viewed" || route == "/products/trending" {
		return false
	}
	if strings.HasPrefix(route, "/products/") && strings.HasSuffix(route, "/view") {
		return false
	}
	return true
}

// CheckAuthMiddleware es un middleware que protege rutas específicas en la aplicación
// verificando la presencia y validez de un token de autenticación en las solicitudes HTTP.
// Si la ruta no requiere autenticación, la solicitud se procesa normalmente.
// Si la ruta requiere autenticación y el token es válido, la solicitud se procesa;
// de lo contrario, se responde con un error de autorización.
func CheckAuthMiddleware(s server.Server) func(h http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !shouldCheckToken(r.URL.Path) {
				// Entra cuando shouldCheckToken es falso
				// La ruta no está protegida, puede seguir (next) sin el token de autenticación
				next.ServeHTTP(w, r)
				return
			}

			_, err := TokenAuth(s, w, *r)
			// Si hay un error al parsear o validar el token, responde con un error de autorización
			if err != nil {
				http.Error(w, err.Error(), http.StatusUnauthorized)
				return
			}

			// Si el token es válido, continúa con la siguiente función en la cadena
			next.ServeHTTP(w, r)
		})
	}
}

// TokenAuth es una función auxiliar que se utiliza para extraer y validar un token de autenticación
func TokenAuth(s server.Server, w http.ResponseWriter, r http.Request) (*jwt.Token, error) {
	tokenString := strings.TrimSpace(r.Header.Get("Authorization"))
	if tokenString == "" {
		return nil, fmt.Errorf("authorization header missing")
	}

	tokenString = strings.TrimPrefix(tokenString, "Bearer ")

	// Intenta parsear y validar el token
	token, err := jwt.ParseWithClaims(tokenString, &models.AppClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Proporciona la clave secreta para validar el token
		return []byte(s.Config().JWTSecret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	return token, nil

}

// RoleProxy verifica si el usuario tiene el rol necesario antes de ejecutar el handler original.
func RoleProxy(allowedRoles []string, s server.Server) func(next http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			token, err := TokenAuth(s, w, *r)
			if err != nil {
				http.Error(w, err.Error(), http.StatusUnauthorized)
				return
			}

			claims, ok := token.Claims.(*models.AppClaims)
			if !ok || !token.Valid {
				http.Error(w, "invalid token", http.StatusUnauthorized)
				return
			}
			// Obtiene los roles del usuario desde la BD
			roles, err := repository.GetUserRoles(context.Background(), claims.UserId)
			if err != nil {
				http.Error(w, "Error retrieving user roles", http.StatusInternalServerError)
				return
			}

			log.Println(roles)

			roleMap := make(map[string]bool)
			for _, role := range roles {
				roleMap[strings.ToLower(role)] = true
			}

			for _, allowedRole := range allowedRoles {
				if roleMap[strings.ToLower(allowedRole)] {
					next(w, r)
					return
				}
			}

			http.Error(w, "Forbidden: insufficient privileges", http.StatusForbidden)

		}
	}
}
