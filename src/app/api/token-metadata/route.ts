import { NextResponse } from 'next/server';
import { apiErrorResponse } from "@/lib/utils/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const addresses = searchParams.get('list');

  if (!addresses) {
    return NextResponse.json({ success: false, message: 'No addresses provided' }, { status: 400 });
  }

  // Validate and limit addresses to prevent abuse
  const addressList = addresses.split(',');
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  if (addressList.length > 50) {
    return NextResponse.json({ success: false, message: 'Maximum 50 addresses per request' }, { status: 400 });
  }

  for (const addr of addressList) {
    if (!base58Regex.test(addr.trim())) {
      return NextResponse.json({ success: false, message: 'Invalid address format' }, { status: 400 });
    }
  }

  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) {
    console.error("BIRDEYE_API_KEY is missing in environment variables");
    return NextResponse.json({ success: false, message: 'Server configuration error' }, { status: 500 });
  }

  try {
    // Use encoded addresses to handle special characters if any, though base58 is safe
    const url = `https://public-api.birdeye.so/defi/v3/token/meta-data/multiple?list_address=${addresses}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        'accept': 'application/json',
        'x-chain': 'solana'
      }
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Birdeye API error:", response.status, errorText);
        return NextResponse.json({ success: false, message: `Birdeye API error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (e: unknown) {
    return apiErrorResponse("Token metadata error", e);
  }
}

