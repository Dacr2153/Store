# Dockerfile.dev

FROM golang:1.23.4-alpine

RUN apk update && apk add --no-cache git ca-certificates && update-ca-certificates
RUN go env -w GOPROXY=direct

# Instalar Air con la ruta actualizada
RUN go install github.com/air-verse/air@latest

WORKDIR /app

# Copiar los archivos de dependencias (opcional, para cache)
COPY go.mod go.sum ./
RUN go mod download

# Copiar el código (opcional, ya que el bind mount lo actualizará)
COPY . .

EXPOSE 5050

# Ejecutar Air para hot reload
ENTRYPOINT ["air"]
