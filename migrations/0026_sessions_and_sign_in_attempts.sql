CREATE TABLE "account_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_digest" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "account_session_token_digest_unique" UNIQUE("token_digest"),
	CONSTRAINT "account_session_token_digest_sha256_length" CHECK (octet_length("account_session"."token_digest") = 32),
	CONSTRAINT "account_session_expires_after_creation" CHECK ("account_session"."expires_at" > "account_session"."created_at")
);
--> statement-breakpoint
CREATE TABLE "sign_in_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_digest" "bytea" NOT NULL,
	"binding_digest" "bytea" NOT NULL,
	"nonce_digest" "bytea" NOT NULL,
	"code_verifier" text NOT NULL,
	"provider" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"invitation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sign_in_attempt_state_digest_unique" UNIQUE("state_digest"),
	CONSTRAINT "sign_in_attempt_digests_sha256_length" CHECK (octet_length("sign_in_attempt"."state_digest") = 32 and octet_length("sign_in_attempt"."binding_digest") = 32 and octet_length("sign_in_attempt"."nonce_digest") = 32),
	CONSTRAINT "sign_in_attempt_code_verifier_shape" CHECK ("sign_in_attempt"."code_verifier" ~ '^[A-Za-z0-9_-]{43,128}$'),
	CONSTRAINT "sign_in_attempt_provider_shape" CHECK ("sign_in_attempt"."provider" ~ '^[a-z]{1,32}$'),
	CONSTRAINT "sign_in_attempt_expires_after_creation" CHECK ("sign_in_attempt"."expires_at" > "sign_in_attempt"."created_at")
);
--> statement-breakpoint
ALTER TABLE "account_session" ADD CONSTRAINT "account_session_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_in_attempt" ADD CONSTRAINT "sign_in_attempt_invitation_id_direct_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."direct_invitation"("id") ON DELETE no action ON UPDATE no action;