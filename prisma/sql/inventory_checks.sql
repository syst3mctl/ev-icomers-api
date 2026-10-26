-- მარაგის შეზღუდვები, რომლებიც Prisma-ს სქემაში ვერ იწერება.
-- ემატება ცალკე მიგრაციით (იხ. README → „ბაზა“).
ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_on_hand_check" CHECK ("on_hand" >= 0),
  ADD CONSTRAINT "inventory_items_reserved_check" CHECK ("reserved" >= 0 AND "reserved" <= "on_hand");

ALTER TABLE "products"
  ADD CONSTRAINT "products_price_minor_check" CHECK ("price_minor" >= 0);

ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_quantity_check" CHECK ("quantity" > 0);
