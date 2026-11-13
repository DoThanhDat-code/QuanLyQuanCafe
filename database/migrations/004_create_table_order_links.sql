SET XACT_ABORT ON;

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.table_order_links', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.table_order_links (
        table_id VARCHAR(10) NOT NULL,
        order_id VARCHAR(20) NOT NULL,

        CONSTRAINT PK_table_order_links PRIMARY KEY (table_id),
        CONSTRAINT FK_table_order_links_tables
            FOREIGN KEY (table_id) REFERENCES dbo.[tables](table_id),
        CONSTRAINT FK_table_order_links_orders
            FOREIGN KEY (order_id) REFERENCES dbo.orders(order_id)
    );

    CREATE INDEX IX_table_order_links_order_id
        ON dbo.table_order_links (order_id);
END;

COMMIT TRANSACTION;