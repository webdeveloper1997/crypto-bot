# Crypto Bot Worker

This package runs on the Oracle VM and owns every sensitive integration:

- Binance market data
- Binance paper/testnet/live execution
- Gemini research filter
- Supabase service-role writes

The dashboard never touches exchange credentials. It writes command rows and reads telemetry only.

