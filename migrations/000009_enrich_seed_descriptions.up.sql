-- 000009_enrich_seed_descriptions.up.sql
-- Enriches each seeded demo product's description with synonyms and bilingual
-- keywords (EN + ES) so that the AI / Postgres full-text search can match
-- shoppers' approximate queries (e.g. "celular" -> Smartphone-style products,
-- "audifonos" -> Wireless Headphones, "zapatos" -> Sneakers, etc.).
--
-- This is intentionally idempotent: each UPDATE only sets the new value when
-- the row matches the original short description we shipped in 000008, so
-- re-running the migration on top of edited data is safe.

-- Electronics ---------------------------------------------------------------
UPDATE products SET description = 'Premium over-ear wireless headphones with active noise cancellation (ANC), 30h battery life, Bluetooth 5.3 and crystal-clear voice calls. Also known as: audifonos inalambricos, auriculares con cancelacion de ruido, cascos bluetooth, headset, earphones.'
 WHERE id = 'seed_elec_001';

UPDATE products SET description = 'Vivid 4K UHD HDR10+ Smart TV with built-in streaming apps (Netflix, Prime, Disney+) and voice remote. Television inteligente, pantalla LED 55 pulgadas, smart tv, monitor grande para sala.'
 WHERE id = 'seed_elec_002';

UPDATE products SET description = '24MP APS-C mirrorless digital camera body with 4K video and in-body image stabilization (IBIS). Camara fotografica profesional, camera for photography and vlogging, content creators.'
 WHERE id = 'seed_elec_003';

UPDATE products SET description = 'Hot-swappable RGB mechanical gaming keyboard, per-key backlight, detachable USB-C cable, compatible with PC and laptop. Teclado mecanico gamer para computadora, teclado para juegos, esports.'
 WHERE id = 'seed_elec_004';

UPDATE products SET description = 'Portable Bluetooth speaker with IPX7 waterproof rating, 24h playtime, deep bass and stereo pairing. Bocina inalambrica, altavoz portatil, parlante bluetooth, audio para fiesta y exteriores.'
 WHERE id = 'seed_elec_005';

UPDATE products SET description = 'Smartwatch Series X with always-on AMOLED display, ECG, SpO2 oxygen sensor, GPS and 7-day battery. Reloj inteligente deportivo, smart watch fitness, alternativa a smartphone para notificaciones.'
 WHERE id = 'seed_elec_006';

-- Fashion -------------------------------------------------------------------
UPDATE products SET description = 'Slim-fit 100% organic cotton t-shirt, soft and breathable, sustainable production. Camiseta de algodon, playera basica, polera unisex, ropa casual hombre y mujer.'
 WHERE id = 'seed_fash_001';

UPDATE products SET description = 'Classic full-grain leather biker jacket, satin lined, YKK zippers. Chaqueta de cuero motociclista, abrigo de piel, jacket negra, ropa de invierno.'
 WHERE id = 'seed_fash_002';

UPDATE products SET description = 'Running sneakers with breathable mesh upper and responsive foam midsole. Tenis para correr, zapatillas deportivas, zapatos deportivos, calzado para gym y running, shoes athletic.'
 WHERE id = 'seed_fash_003';

UPDATE products SET description = 'Slim-leg stretch denim jeans, dark wash, tailored fit. Pantalon de mezclilla slim, jean azul oscuro, pants vaqueros para hombre.'
 WHERE id = 'seed_fash_004';

UPDATE products SET description = 'Timeless wool-blend overcoat for cold weather. Abrigo largo de lana, sobretodo elegante, gabardina formal, ropa de invierno hombre y mujer.'
 WHERE id = 'seed_fash_005';

UPDATE products SET description = 'Aviator sunglasses with polarized UV400 lenses and lightweight metal frame. Lentes de sol estilo aviador, gafas oscuras polarizadas, anteojos para verano.'
 WHERE id = 'seed_fash_006';

-- Home & Kitchen ------------------------------------------------------------
UPDATE products SET description = 'Tri-ply stainless steel 10-piece cookware set: pots, pans, lids; induction compatible. Bateria de cocina acero inoxidable, ollas y sartenes, kitchen pans, utensilios para cocinar.'
 WHERE id = 'seed_home_001';

UPDATE products SET description = '15-bar pump espresso machine with steam wand and milk frother. Cafetera espresso italiana, maquina de cafe profesional, capuccino, latte, kitchen appliance.'
 WHERE id = 'seed_home_002';

UPDATE products SET description = 'Robot vacuum cleaner with LIDAR mapping, app control and self-charging dock. Aspiradora robot inteligente, robot de limpieza para casa, hogar smart home.'
 WHERE id = 'seed_home_003';

UPDATE products SET description = 'Memory foam pillow 2-pack with ventilated cooling gel and hypoallergenic bamboo cover. Almohada viscoelastica para dormir, pillow para cama, descanso ergonomico.'
 WHERE id = 'seed_home_004';

UPDATE products SET description = 'Air fryer 6L XL with digital touch panel and 8 cooking presets, dishwasher-safe basket. Freidora de aire sin aceite, air fryer grande, electrodomestico de cocina saludable.'
 WHERE id = 'seed_home_005';

UPDATE products SET description = 'Smart LED lamp with 16M colors, music sync, Wi-Fi, works with Alexa and Google Home. Lampara inteligente RGB, luz LED de mesa para escritorio, iluminacion smart hogar.'
 WHERE id = 'seed_home_006';

-- Beauty --------------------------------------------------------------------
UPDATE products SET description = '20% L-ascorbic acid Vitamin C brightening serum with hyaluronic acid and vitamin E. Serum facial iluminador, antioxidante, cuidado de la piel, skincare antienvejecimiento.'
 WHERE id = 'seed_beau_001';

UPDATE products SET description = 'Ionic professional hair dryer 1800W with 3 heat settings and cool shot. Secador de pelo profesional, secadora de cabello ionica, peluqueria salon styling.'
 WHERE id = 'seed_beau_002';

UPDATE products SET description = 'Luxury 100ml floral-amber perfume for evening wear. Perfume mujer fragancia floral, eau de parfum, fragrance gift, regalo elegante.'
 WHERE id = 'seed_beau_003';

UPDATE products SET description = 'Mineral SPF 50 sunscreen, reef-safe, lightweight, non-greasy. Protector solar facial y corporal, bloqueador FPS 50, cuidado piel, sunscreen daily.'
 WHERE id = 'seed_beau_004';

UPDATE products SET description = 'Sonic electric toothbrush with 40k vibrations/min, 5 cleaning modes and pressure sensor. Cepillo de dientes electrico sonico, higiene dental, oral care.'
 WHERE id = 'seed_beau_005';

UPDATE products SET description = 'Skincare gift set: cleanser, toner and moisturizer trio for all skin types. Set de cuidado facial, kit de belleza, regalo skincare mujer y hombre.'
 WHERE id = 'seed_beau_006';

-- Sports --------------------------------------------------------------------
UPDATE products SET description = 'Eco-friendly 6mm TPE yoga mat with alignment lines and carry strap. Tapete de yoga antideslizante, colchoneta para pilates, mat para entrenamiento gym home.'
 WHERE id = 'seed_sprt_001';

UPDATE products SET description = 'Adjustable dumbbells pair, quick-select 2.5kg to 25kg in 2.5kg increments. Mancuernas ajustables, pesas para gimnasio en casa, weights for strength training.'
 WHERE id = 'seed_sprt_002';

UPDATE products SET description = 'MIPS-compatible mountain bike helmet with 24 vents and removable visor. Casco de bicicleta MTB, helmet ciclismo de montana, proteccion para bicicleta y bike.'
 WHERE id = 'seed_sprt_003';

UPDATE products SET description = 'Lightweight quick-dry running shorts with phone pocket. Shorts para correr, pantaloneta deportiva, ropa para gimnasio y athletic training.'
 WHERE id = 'seed_sprt_004';

UPDATE products SET description = 'Match-grade size 5 soccer ball with hand-stitched panels. Balon de futbol numero 5, pelota oficial soccer, deporte equipo.'
 WHERE id = 'seed_sprt_005';

UPDATE products SET description = 'Fitness tracker wristband: heart rate, sleep tracking, 14 sport modes, 10-day battery. Pulsera inteligente smartband, reloj deportivo, fitness watch alternativa smartwatch.'
 WHERE id = 'seed_sprt_006';

-- Books ---------------------------------------------------------------------
UPDATE products SET description = 'The Pragmatic Programmer 20th anniversary edition. Classic guide to software craftsmanship and clean code. Libro de programacion, software development, manual ingenieria informatica.'
 WHERE id = 'seed_book_001';

UPDATE products SET description = 'Clean Architecture: a craftsman''s guide to software structure and design by Robert C. Martin. Libro arquitectura de software, diseno de sistemas, lectura para desarrolladores.'
 WHERE id = 'seed_book_002';

UPDATE products SET description = 'Designing Data-Intensive Applications: the big ideas behind reliable, scalable, maintainable systems. Libro de bases de datos distribuidas, big data, backend engineering.'
 WHERE id = 'seed_book_003';

UPDATE products SET description = 'Atomic Habits by James Clear: easy & proven way to build good habits and break bad ones. Libro de habitos, productividad personal, self-help motivacional.'
 WHERE id = 'seed_book_004';

UPDATE products SET description = 'Deep Work by Cal Newport: rules for focused success in a distracted world. Libro de productividad, concentracion, lectura para profesionales.'
 WHERE id = 'seed_book_005';

UPDATE products SET description = 'Sapiens: A Brief History of Humankind by Yuval Noah Harari. Libro de historia, antropologia, novela ensayo bestseller.'
 WHERE id = 'seed_book_006';

-- Toys ----------------------------------------------------------------------
UPDATE products SET description = '1000-piece building blocks set, compatible with major brick brands. Bloques de construccion tipo lego, juguete creativo para ninos, kids constructive play.'
 WHERE id = 'seed_toys_001';

UPDATE products SET description = 'Remote control drone with HD camera, GPS return-home and 25-min flight time. Dron con camara, juguete electronico RC, drone para ninos y adultos.'
 WHERE id = 'seed_toys_002';

UPDATE products SET description = 'Wooden 500-piece jigsaw puzzle on premium FSC plywood with vivid artwork. Rompecabezas de madera, puzzle para adultos y ninos, juego de mesa relajante.'
 WHERE id = 'seed_toys_003';

UPDATE products SET description = '40cm hypoallergenic plush teddy bear, machine washable. Oso de peluche grande, muneco de felpa, juguete para bebe, soft toy gift.'
 WHERE id = 'seed_toys_004';

UPDATE products SET description = 'Classic strategy board game for 2 to 4 players. Juego de mesa estrategia, board game familia, juego de cartas y tablero.'
 WHERE id = 'seed_toys_005';

UPDATE products SET description = 'Kids educational tablet with parental controls and 100+ pre-installed learning apps. Tablet infantil educativa, juguete electronico para ninos, kids learning device.'
 WHERE id = 'seed_toys_006';

-- Automotive ----------------------------------------------------------------
UPDATE products SET description = '4K front + 1080p rear dash cam with Wi-Fi and built-in GPS. Camara para auto coche, dashcam para carro, automotive accessories video grabador.'
 WHERE id = 'seed_auto_001';

UPDATE products SET description = 'Portable jump starter 2000A: boost 8L gas / 6L diesel engines, USB-C output. Arrancador de bateria para auto, cargador portatil para carro, automotive emergency.'
 WHERE id = 'seed_auto_002';

UPDATE products SET description = 'Cordless tire inflator with auto-stop pressure, LED light, rechargeable battery. Inflador de llantas portatil, compresor para carro auto, automotive accessory.'
 WHERE id = 'seed_auto_003';

UPDATE products SET description = 'Magnetic vent-mount car phone holder, works with all smartphone sizes. Soporte de celular para carro, holder de telefono auto, automotive smartphone mount.'
 WHERE id = 'seed_auto_004';

UPDATE products SET description = 'Microfiber wash mitt with 4 premium drying towels. Guante y toallas microfibra para lavar auto, kit de limpieza coche, automotive detailing.'
 WHERE id = 'seed_auto_005';

UPDATE products SET description = 'Waterproof 425L roof cargo bag for any vehicle. Bolso de techo impermeable para carro, equipaje extra coche, automotive travel storage.'
 WHERE id = 'seed_auto_006';
