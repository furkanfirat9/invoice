export interface OzonPosting {
  posting_number: string;
  order_id?: number;
  order_number?: string;
  order_date?: string;
  status?: string;
  tracking_number?: string;
  in_process_at?: string;
  shipment_date?: string;
  products?: PostingProduct[];
  analytics_data?: {
    region: string;
    city: string;
    delivery_type: string;
    warehouse_id?: number;
    warehouse?: string;
  };
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  barcodes?: {
    upper_barcode?: string;
    lower_barcode?: string;
  };
}

export interface PostingProduct {
  name: string;
  quantity: number;
  price: string;
  offer_id?: string;
  sku?: number;
  currency_code?: string;
}



