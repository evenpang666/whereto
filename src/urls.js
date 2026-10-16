export const assetUrl = value => typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? import.meta.env.BASE_URL + value.slice(1) : value;
