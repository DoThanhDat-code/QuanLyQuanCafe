-- Run in the existing project database, not master. Back up first.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.invoices','paid_by') IS NULL
 ALTER TABLE dbo.invoices ADD paid_by varchar(10) NULL REFERENCES dbo.users(user_id);
IF COL_LENGTH('dbo.invoices','cash_received') IS NULL
 ALTER TABLE dbo.invoices ADD cash_received decimal(12,0) NULL;
IF COL_LENGTH('dbo.invoices','transaction_reference') IS NULL
 ALTER TABLE dbo.invoices ADD transaction_reference nvarchar(100) NULL;
COMMIT;
GO
-- One source of revenue; no duplicate payment table.
IF OBJECT_ID('dbo.payments','U') IS NULL
 EXEC(N'CREATE OR ALTER VIEW dbo.payments AS SELECT invoice_id
 AS payment_id,order_id,total_amount AS amount,payment_method,CAST(''completed'' AS varchar(20)) 
 AS status,paid_by,paid_at,transaction_reference FROM dbo.invoices');
GO
