package database

// implementacion concreta
import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/kevintovar01/Store/models"
	_ "github.com/lib/pq" // necesarion para que los drives de postgres funcionen.
)

const (
	PAGINATION_SIZE = 34
)

type PostgresRepository struct {
	db *sql.DB
}

// DB returns the underlying *sql.DB for use by adapters that need raw access
// (auth tokens, email queue, etc). Use sparingly; prefer adding a Repository method.
func (repo *PostgresRepository) DB() *sql.DB { return repo.db }

func NewPostgresRepository(url string) (*PostgresRepository, error) {
	db, err := sql.Open("postgres", url)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("cannot connect to database: %w", err)
	}

	return &PostgresRepository{db}, nil
}

func (repo *PostgresRepository) InsertUser(ctx context.Context, user *models.User) error {
	// execContext permite ejecutar codigo sql
	_, err := repo.db.ExecContext(ctx, "INSERT INTO users (id, email, password) VALUES ($1, $2, $3)", user.Id, user.Email, user.Password)
	return err
}

func (repo *PostgresRepository) GetUserById(ctx context.Context, id string) (*models.User, error) {
	rows, err := repo.db.QueryContext(ctx, "SELECT id, email FROM users WHERE id = $1", id)

	defer func() {
		if cerr := rows.Close(); cerr != nil {
			log.Println("error closing rows:", cerr)
		}
	}()

	var user = models.User{}
	for rows.Next() {
		// toma rows he intenta mapear los valores de las columnas "SELECT id email FROM" dentro del modelo de datos de usuario.
		if err = rows.Scan(&user.Id, &user.Email); err == nil { // parseo datos para se adaptados al modelo user
			log.Println(user)
			return &user, nil
		}
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	log.Println(id)

	return &user, nil

}

func (repo *PostgresRepository) Close() error {
	return repo.db.Close() // cierra conexion de la base de datos cuando se deja usar.
}

func (repo *PostgresRepository) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	rows, err := repo.db.QueryContext(ctx, "SELECT id, email, password FROM users WHERE email = $1", email)

	defer func() {
		if cerr := rows.Close(); cerr != nil {
			log.Println("error closing rows:", cerr)
		}
	}()

	var user = models.User{}
	for rows.Next() {
		// toma rows he intenta mapear los valores de las columnas "SELECT id email FROM" dentro del modelo de datos de usuario.
		if err = rows.Scan(&user.Id, &user.Email, &user.Password); err == nil { // parseo datos para ser adaptados al modelo user
			return &user, nil
		}
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return &user, nil

}

func (repo *PostgresRepository) InsertProduct(ctx context.Context, product *models.Product) error {
	log.Print(product)
	// execContext permite ejecutar codigo sql
	_, err := repo.db.ExecContext(
		ctx,
		"INSERT INTO products (id, name, price, stock, user_id, description) VALUES ($1, $2, $3, $4, $5, $6)",
		product.Id,
		product.Name,
		product.Price,
		product.Stock,
		product.User_id,
		product.Description)
	return err
}

func (repo *PostgresRepository) UpdateProduct(ctx context.Context, product *models.Product) error {
	_, err := repo.db.ExecContext(
		ctx,
		"UPDATE products SET name = $1, description = $2, price = $3, stock = $4 WHERE id = $5 and user_id = $6",
		product.Name,
		product.Description,
		product.Price,
		product.Stock,
		product.Id,
		product.User_id)
	return err
}

func (repo *PostgresRepository) DeleteProduct(ctx context.Context, id string, userId string) error {
	_, err := repo.db.ExecContext(ctx, "DELETE FROM products WHERE id = $1 and user_id = $2", id, userId)
	return err
}

func (repo *PostgresRepository) ListProduct(ctx context.Context, filter models.ProductFilter) ([]*models.ProductList, error) {
	query := `SELECT 
			p.id, p.name, p.price, p.stock, p.user_id, p.description, p.created_at,
			COALESCE((
				SELECT i.url FROM product_images pi2
				JOIN images i ON i.id = pi2.image_id
				WHERE pi2.product_id = p.id LIMIT 1
			), '/uploads/default/product.jpg') AS image_url
		FROM products p
		WHERE 1=1`

	args := []interface{}{}
	argIdx := 1

	// Relevance score and lenient match. The previous implementation used
	// plainto_tsquery which AND's all terms, so a query like "phone" missed
	// products whose description used "smartphone". We now:
	//   - OR the user's terms together (`t1 | t2 | t3`)
	//   - additionally match via ILIKE on name/description so partial / lemma
	//     differences still count
	//   - boost rows whose NAME contains a term (more relevant than only desc)
	//   - order by score so the most relevant items show first
	hasSearch := false
	rankExpr := "0::float"
	if filter.Search != "" {
		// Tokenise on whitespace; keep tokens >= 2 chars, strip punctuation,
		// dedupe, and cap to a sane number to avoid pathological queries.
		raw := filter.Search
		// crude sanitiser: keep letters/digits, replace others with space
		clean := make([]rune, 0, len(raw))
		for _, r := range raw {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') ||
				(r >= 0x00C0 && r <= 0x024F) /* extended Latin */ {
				clean = append(clean, r)
			} else {
				clean = append(clean, ' ')
			}
		}
		fields := strings.Fields(string(clean))
		seen := map[string]bool{}
		terms := make([]string, 0, len(fields))
		for _, f := range fields {
			lf := strings.ToLower(f)
			if len(lf) < 2 || seen[lf] {
				continue
			}
			seen[lf] = true
			terms = append(terms, lf)
			if len(terms) >= 8 {
				break
			}
		}
		if len(terms) > 0 {
			hasSearch = true
			tsq := strings.Join(terms, " | ")
			tsqIdx := argIdx
			args = append(args, tsq)
			argIdx++

			// Build ILIKE OR fragments for both description+name (general match)
			// and name-only (boost).
			likeFrags := make([]string, 0, len(terms))
			nameFrags := make([]string, 0, len(terms))
			for _, t := range terms {
				p := argIdx
				args = append(args, "%"+t+"%")
				argIdx++
				likeFrags = append(likeFrags, fmt.Sprintf("(p.name ILIKE $%d OR COALESCE(p.description,'') ILIKE $%d)", p, p))
				np := argIdx
				args = append(args, "%"+t+"%")
				argIdx++
				nameFrags = append(nameFrags, fmt.Sprintf("p.name ILIKE $%d", np))
			}
			likeOr := strings.Join(likeFrags, " OR ")
			nameOr := strings.Join(nameFrags, " OR ")
			rankExpr = fmt.Sprintf(
				`(ts_rank(to_tsvector('english', p.name || ' ' || COALESCE(p.description,'')), to_tsquery('english', $%d))
				   + CASE WHEN %s THEN 0.5 ELSE 0 END
				   + CASE WHEN %s THEN 0.2 ELSE 0 END)`,
				tsqIdx, nameOr, likeOr,
			)
			query += fmt.Sprintf(
				` AND (to_tsvector('english', p.name || ' ' || COALESCE(p.description,'')) @@ to_tsquery('english', $%d) OR (%s))`,
				tsqIdx, likeOr,
			)
		}
	}
	if filter.MinPrice > 0 {
		query += fmt.Sprintf(" AND p.price >= $%d", argIdx)
		args = append(args, filter.MinPrice)
		argIdx++
	}
	if filter.MaxPrice > 0 {
		query += fmt.Sprintf(" AND p.price <= $%d", argIdx)
		args = append(args, filter.MaxPrice)
		argIdx++
	}
	if filter.Category != "" {
		query += fmt.Sprintf(` AND EXISTS (
			SELECT 1 FROM product_categories pc
			JOIN categories cat ON cat.id = pc.category_id
			WHERE pc.product_id = p.id AND cat.slug = $%d
		)`, argIdx)
		args = append(args, filter.Category)
		argIdx++
	}

	if hasSearch {
		// Most relevant first, with newest as a tie-breaker.
		query += " ORDER BY " + rankExpr + " DESC, p.created_at DESC"
	} else {
		query += " ORDER BY p.created_at DESC"
	}
	query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	args = append(args, PAGINATION_SIZE, filter.Page*PAGINATION_SIZE)

	rows, err := repo.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() {
		if cerr := rows.Close(); cerr != nil {
			log.Println("error closing rows:", cerr)
		}
	}()

	var products []*models.ProductList
	for rows.Next() {
		var p models.ProductList
		if err = rows.Scan(&p.Id, &p.Name, &p.Price, &p.Stock, &p.User_id, &p.Description, &p.CreatedAt, &p.Url); err == nil {
			products = append(products, &p)
		}
	}
	return products, rows.Err()
}

func (repo *PostgresRepository) GetProductById(ctx context.Context, id string) (*models.ProductList, error) {
	// Fetch the product row (single row, no join).
	var product = models.ProductList{}
	err := repo.db.QueryRowContext(ctx,
		`SELECT p.id, p.name, p.price, p.stock, p.user_id, p.description, p.created_at
		 FROM products p WHERE p.id = $1`, id,
	).Scan(&product.Id, &product.Name, &product.Price, &product.Stock,
		&product.User_id, &product.Description, &product.CreatedAt)
	if err != nil {
		return nil, err
	}

	// Fetch all images for the product.
	imgRows, err := repo.db.QueryContext(ctx,
		`SELECT i.url FROM product_images pi2
		 JOIN images i ON i.id = pi2.image_id
		 WHERE pi2.product_id = $1 ORDER BY pi2.created_at`, id)
	if err != nil {
		return nil, err
	}
	defer imgRows.Close()
	var urls []string
	for imgRows.Next() {
		var u string
		if serr := imgRows.Scan(&u); serr == nil {
			urls = append(urls, u)
		}
	}
	if len(urls) == 0 {
		product.Url = "/uploads/default/product.jpg"
		product.Images = []string{"/uploads/default/product.jpg"}
	} else {
		product.Url = urls[0]
		product.Images = urls
	}

	log.Println("GetProductById", id, "images:", len(product.Images))
	return &product, nil
}

func (repo *PostgresRepository) InsertImage(ctx context.Context, image *models.Image) (string, error) {
	var imageID string
	log.Print("imagen creada", image)
	err := repo.db.QueryRowContext(
		ctx,
		"INSERT INTO images (user_id, url, name, type, size) VALUES ($1,$2,$3,$4,$5) RETURNING id",
		image.UserId,
		image.Url,
		image.Name,
		image.Type,
		image.Size).Scan(&imageID)
	return imageID, err
}

func (repo *PostgresRepository) LinkProductToImage(ctx context.Context, productID string, imageID string) error {
	_, err := repo.db.ExecContext(
		ctx,
		"INSERT INTO product_images (product_id, image_id) VALUES ($1, $2)",
		productID,
		imageID,
	)
	return err
}

func (repo *PostgresRepository) GetImageById(ctx context.Context, productId string) (*models.Image, error) {
	var imageLink models.ImageLink
	err := repo.db.QueryRowContext(
		ctx,
		"SELECT product_id, image_id, created_at FROM product_images WHERE product_id = $1 LIMIT 1",
		productId,
	).Scan(&imageLink.ProductId, &imageLink.ImageId, &imageLink.CreatedAt)
	if err != nil {
		return nil, err
	}

	var image models.Image
	err = repo.db.QueryRowContext(
		ctx,
		"SELECT user_id, url, name, type, size, created_at FROM images WHERE id = $1",
		imageLink.ImageId,
	).Scan(&image.UserId, &image.Url, &image.Name, &image.Type, &image.Size, &image.CreatedAt)
	if err != nil {
		return nil, err
	}

	return &image, nil
}

func (repo *PostgresRepository) CreateWishCar(ctx context.Context, whishCar *models.Car) error {
	log.Println("CreateWishCar", whishCar)
	log.Println("carID", whishCar.Id)
	log.Println("userID:", whishCar.UserId)
	log.Println("total:", whishCar.Total)
	_, err := repo.db.ExecContext(
		ctx,
		"INSERT INTO wishcar (id, user_id, total) VALUES ($1, $2, $3)",
		whishCar.Id,
		whishCar.UserId,
		whishCar.Total)
	return err
}

func (repo *PostgresRepository) AddItem(ctx context.Context, carItem *models.CarItem) error {
	log.Println("AddItem", carItem)
	_, err := repo.db.ExecContext(
		ctx,
		"INSERT INTO car_item (car_id, product_id, quantity) VALUES ($1, $2, $3)",
		carItem.CarId,
		carItem.ProductId,
		carItem.Quantity)

	return err
}

func (repo *PostgresRepository) RemoveItem(ctx context.Context, productId string, carId string) error {
	_, err := repo.db.ExecContext(ctx, "DELETE FROM car_item WHERE product_id = $1 AND car_id = $2", productId, carId)
	return err
}

func (repo *PostgresRepository) UpdateQuantity(ctx context.Context, productId string, quantity int) error {
	_, err := repo.db.ExecContext(ctx, "UPDATE car_item SET quantity = quantity + $1 WHERE product_id = $2", quantity, productId)
	return err
}

func (repo *PostgresRepository) GetItem(ctx context.Context, productId string, carId string) (*models.CarItem, error) {
	rows, err := repo.db.QueryContext(
		ctx,
		"SELECT id, car_id, product_id, quantity FROM car_item WHERE product_id = $1 AND car_id = $2",
		productId,
		carId)

	defer func() {
		if cerr := rows.Close(); cerr != nil {
			log.Println("error closing rows:", cerr)
		}
	}()
	var carItem = models.CarItem{}
	for rows.Next() {
		if err = rows.Scan(&carItem.Id, &carItem.CarId, &carItem.ProductId, &carItem.Quantity); err == nil {
			return &carItem, nil
		}
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return &carItem, nil
}

func (repo *PostgresRepository) GetWishCarById(ctx context.Context, userId string) (*models.Car, error) {
	rows, err := repo.db.QueryContext(
		ctx,
		"SELECT id, user_id, total, created_at FROM wishcar WHERE user_id = $1",
		userId)

	defer func() {
		if cerr := rows.Close(); cerr != nil {
			log.Println("error closing rows:", cerr)
		}
	}()

	var wishcar = models.Car{}
	for rows.Next() {
		if err = rows.Scan(&wishcar.Id, &wishcar.UserId, &wishcar.Total, &wishcar.CreatedAt); err == nil {
			return &wishcar, nil
		}

	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return &wishcar, nil

}

func (repo *PostgresRepository) UpdateWishCar(ctx context.Context, wishCar *models.Car) error {
	_, err := repo.db.ExecContext(
		ctx,
		"UPDATE wishcar SET total = $1 WHERE id = $2",
		wishCar.Total,
		wishCar.Id)
	return err
}

func (repo *PostgresRepository) ListItems(ctx context.Context, userId string) ([]*models.CarItemDetail, error) {
	rows, err := repo.db.QueryContext(
		ctx,
		`SELECT ci.id,
		        ci.car_id,
		        ci.product_id,
		        ci.quantity,
		        p.name,
		        CAST(p.price AS float8),
		        p.stock,
		        COALESCE(p.description, ''),
		        COALESCE(img.url, '') AS url
		   FROM car_item AS ci
		   JOIN wishcar  AS w  ON w.id  = ci.car_id
		   JOIN products AS p  ON p.id  = ci.product_id
		   LEFT JOIN LATERAL (
		        SELECT i.url
		          FROM product_images pi2
		          JOIN images i ON i.id = pi2.image_id
		         WHERE pi2.product_id = p.id
		         LIMIT 1
		   ) img ON TRUE
		  WHERE w.user_id = $1`,
		userId,
	)
	if err != nil {
		return nil, err
	}
	defer func() {
		if cerr := rows.Close(); cerr != nil {
			log.Println("error closing rows:", cerr)
		}
	}()

	var carItems []*models.CarItemDetail
	for rows.Next() {
		var it models.CarItemDetail
		if err = rows.Scan(
			&it.Id,
			&it.CarId,
			&it.ProductId,
			&it.Quantity,
			&it.Name,
			&it.Price,
			&it.Stock,
			&it.Description,
			&it.Url,
		); err == nil {
			carItems = append(carItems, &it)
		}
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	log.Println("itemscar:", carItems)
	return carItems, nil
}

// roles

func (repo PostgresRepository) CreateRole(ctx context.Context, role *models.Role) error {
	_, err := repo.db.ExecContext(
		ctx,
		"INSERT INTO roles (name) VALUES ($1)",
		role.Name)
	return err
}

func (repo PostgresRepository) ListRoles(ctx context.Context) ([]*models.Role, error) {
	rows, err := repo.db.QueryContext(
		ctx,
		"SELECT id, name FROM roles")
	if err != nil {
		return nil, err
	}

	defer func() {
		if cerr := rows.Close(); cerr != nil {
			log.Println("error closing rows:", cerr)
		}
	}()

	var roles []*models.Role
	for rows.Next() {
		var role = models.Role{}
		if err = rows.Scan(
			&role.Id,
			&role.Name); err == nil {
			roles = append(roles, &role)
		}
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return roles, nil
}

func (repo PostgresRepository) GetRole(ctx context.Context, name string) (*models.Role, error) {
	rows, err := repo.db.QueryContext(
		ctx,
		"SELECT id, name FROM roles WHERE name= $1",
		name)

	defer func() {
		if cerr := rows.Close(); cerr != nil {
			log.Println("error closing rows:", cerr)
		}
	}()

	var role = models.Role{}
	for rows.Next() {
		if err = rows.Scan(&role.Id, &role.Name); err == nil {
			return &role, nil
		}

	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return &role, nil
}

func (repo PostgresRepository) SetRoleUser(ctx context.Context, userId string, roleId int) error {
	_, err := repo.db.ExecContext(
		ctx,
		"INSERT INTO users_roles (user_id, role_id) VALUES ($1, $2)",
		userId,
		roleId,
	)
	return err
}

func (repo PostgresRepository) GetUserRoles(ctx context.Context, userId string) ([]string, error) {
	rows, err := repo.db.QueryContext(
		ctx,
		"SELECT r.name FROM users_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1",
		userId)
	if err != nil {
		return nil, err
	}

	defer func() {
		if cerr := rows.Close(); cerr != nil {
			log.Println("error closing rows:", cerr)
		}
	}()

	var roles []string
	for rows.Next() {
		var roleName string
		if err := rows.Scan(&roleName); err != nil {
			return nil, err
		}
		roles = append(roles, roleName)
	}
	return roles, nil
}

func (repo PostgresRepository) InsertUserBusiness(ctx context.Context, bussinessman *models.Bussinessman) error {
	_, err := repo.db.ExecContext(
		ctx,
		"INSERT INTO bussinessman (user_id, company_name, company_id) VALUES ($1, $2, $3)",
		bussinessman.UserId,
		bussinessman.CompanyName,
		bussinessman.CompanyId)
	return err
}

func (repo *PostgresRepository) InsertUserWithBusiness(ctx context.Context, user *models.User, b *models.Bussinessman) error {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	_, err = tx.ExecContext(ctx,
		"INSERT INTO users (id, email, password) VALUES ($1, $2, $3)",
		user.Id, user.Email, user.Password)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx,
		"INSERT INTO bussinessman (user_id, company_name, company_id) VALUES ($1, $2, $3)",
		b.UserId, b.CompanyName, b.CompanyId)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func (repo *PostgresRepository) CreateOrderFromCart(ctx context.Context, userId string, car *models.Car, items []*models.CarItem, notes string) (*models.Order, error) {
	tx, err := repo.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	var order models.Order
	err = tx.QueryRowContext(ctx,
		"INSERT INTO orders (user_id, total, notes) VALUES ($1, $2, $3) RETURNING id, user_id, status, total, COALESCE(notes,''), created_at, updated_at",
		userId, car.Total, notes,
	).Scan(&order.Id, &order.UserId, &order.Status, &order.Total, &order.Notes, &order.CreatedAt, &order.UpdatedAt)
	if err != nil {
		return nil, err
	}

	for _, item := range items {
		product, perr := repo.GetProductById(ctx, item.ProductId)
		if perr != nil {
			err = perr
			return nil, err
		}
		_, err = tx.ExecContext(ctx,
			"INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)",
			order.Id, item.ProductId, item.Quantity, product.Price)
		if err != nil {
			return nil, err
		}
	}

	_, err = tx.ExecContext(ctx, "DELETE FROM car_item WHERE car_id = $1", car.Id)
	if err != nil {
		return nil, err
	}
	_, err = tx.ExecContext(ctx, "UPDATE wishcar SET total = 0 WHERE id = $1", car.Id)
	if err != nil {
		return nil, err
	}

	err = tx.Commit()
	if err != nil {
		return nil, err
	}
	return &order, nil
}

func (repo *PostgresRepository) ListOrders(ctx context.Context, userId string) ([]*models.Order, error) {
	rows, err := repo.db.QueryContext(ctx,
		"SELECT id, user_id, status, total, COALESCE(notes,''), created_at, updated_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC",
		userId)
	if err != nil {
		return nil, err
	}
	defer func() {
		if cerr := rows.Close(); cerr != nil {
			log.Println("error closing rows:", cerr)
		}
	}()
	var orders []*models.Order
	for rows.Next() {
		var o models.Order
		if err = rows.Scan(&o.Id, &o.UserId, &o.Status, &o.Total, &o.Notes, &o.CreatedAt, &o.UpdatedAt); err == nil {
			orders = append(orders, &o)
		}
	}
	return orders, rows.Err()
}

func (repo *PostgresRepository) GetOrderById(ctx context.Context, orderId string, userId string) (*models.Order, error) {
	var o models.Order
	err := repo.db.QueryRowContext(ctx,
		"SELECT id, user_id, status, total, COALESCE(notes,''), created_at, updated_at FROM orders WHERE id = $1 AND user_id = $2",
		orderId, userId,
	).Scan(&o.Id, &o.UserId, &o.Status, &o.Total, &o.Notes, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, err
	}
	rows, err := repo.db.QueryContext(ctx,
		"SELECT id, order_id, product_id, quantity, unit_price FROM order_items WHERE order_id = $1", orderId)
	if err != nil {
		return nil, err
	}
	defer func() {
		if cerr := rows.Close(); cerr != nil {
			log.Println("error closing rows:", cerr)
		}
	}()
	for rows.Next() {
		var item models.OrderItem
		if err = rows.Scan(&item.Id, &item.OrderId, &item.ProductId, &item.Quantity, &item.UnitPrice); err == nil {
			o.Items = append(o.Items, item)
		}
	}
	return &o, rows.Err()
}
