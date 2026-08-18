FROM postgres:10.3

# Copia del archivo up.sql, dentro del directorio para se lo primero que se ejecute
COPY up.sql /docker-entrypoint-initdb.d/1.sql

# comando para inicializar la base de datos
CMD ["postgres"] 