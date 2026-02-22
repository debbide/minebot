package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
)

func Sign(token, payload string) string {
	mac := hmac.New(sha256.New, []byte(token))
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}
