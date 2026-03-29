use async_graphql::{dataloader::DataLoader, Context, Enum, Error, Object, Result, SimpleObject};
use chrono::{DateTime, Utc};
use shared::models::{Contract, ContractVersion, Network, Organization, Publisher, VisibilityType};
use uuid::Uuid;

use crate::state::AppState;

// ─── ContractType ────────────────────────────────────────────────────────────

pub struct ContractType {
    pub id: Uuid,
    pub contract_id: String,
    pub wasm_hash: String,
    pub name: String,
    pub description: Option<String>,
    pub publisher_id: Uuid,
    pub network: Network,
    pub is_verified: bool,
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub health_score: i32,
    pub visibility: VisibilityType,
    pub organization_id: Option<Uuid>,
}

#[Object]
impl ContractType {
    async fn id(&self) -> Uuid {
        self.id
    }
    async fn contract_id(&self) -> &str {
        &self.contract_id
    }
    async fn wasm_hash(&self) -> &str {
        &self.wasm_hash
    }
    async fn name(&self) -> &str {
        &self.name
    }
    async fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }
    async fn network(&self) -> NetworkType {
        self.network.clone().into()
    }
    async fn is_verified(&self) -> bool {
        self.is_verified
    }
    async fn category(&self) -> Option<&str> {
        self.category.as_deref()
    }
    async fn tags(&self) -> &[String] {
        &self.tags
    }
    async fn created_at(&self) -> DateTime<Utc> {
        self.created_at
    }
    async fn updated_at(&self) -> DateTime<Utc> {
        self.updated_at
    }
    async fn health_score(&self) -> i32 {
        self.health_score
    }
    async fn visibility(&self) -> VisibilityTypeGraphQL {
        self.visibility.clone().into()
    }

    /// Resolve the publisher for this contract (uses DataLoader to avoid N+1)
    async fn publisher(&self, ctx: &Context<'_>) -> Result<PublisherType> {
        let loader =
            ctx.data_unchecked::<DataLoader<crate::graphql::loaders::PublisherLoader>>();
        let publisher = loader
            .load_one(self.publisher_id)
            .await?
            .ok_or_else(|| Error::new("Publisher not found"))?;
        Ok(PublisherType::from(publisher))
    }

    /// Resolve the owning organisation (if any)
    async fn organization(&self, ctx: &Context<'_>) -> Result<Option<OrganizationType>> {
        if let Some(org_id) = self.organization_id {
            let loader =
                ctx.data_unchecked::<DataLoader<crate::graphql::loaders::OrganizationLoader>>();
            let org = loader.load_one(org_id).await?;
            Ok(org.map(OrganizationType::from))
        } else {
            Ok(None)
        }
    }

    /// Resolve versions for this contract (uses DataLoader; optional limit)
    async fn versions(
        &self,
        ctx: &Context<'_>,
        limit: Option<usize>,
    ) -> Result<Vec<ContractVersionType>> {
        let loader =
            ctx.data_unchecked::<DataLoader<crate::graphql::loaders::ContractVersionsLoader>>();
        let versions = loader.load_one(self.id).await?.unwrap_or_default();
        let items = versions
            .into_iter()
            .take(limit.unwrap_or(usize::MAX))
            .map(ContractVersionType::from)
            .collect();
        Ok(items)
    }
}

impl From<Contract> for ContractType {
    fn from(c: Contract) -> Self {
        Self {
            id: c.id,
            contract_id: c.contract_id,
            wasm_hash: c.wasm_hash,
            name: c.name,
            description: c.description,
            publisher_id: c.publisher_id,
            network: c.network,
            is_verified: c.is_verified,
            category: c.category,
            tags: c.tags,
            created_at: c.created_at,
            updated_at: c.updated_at,
            health_score: c.health_score,
            visibility: c.visibility,
            organization_id: c.organization_id,
        }
    }
}

// ─── Network / Visibility enums ──────────────────────────────────────────────

#[derive(Enum, Copy, Clone, Eq, PartialEq)]
pub enum NetworkType {
    Mainnet,
    Testnet,
    Futurenet,
}

impl From<Network> for NetworkType {
    fn from(n: Network) -> Self {
        match n {
            Network::Mainnet => Self::Mainnet,
            Network::Testnet => Self::Testnet,
            Network::Futurenet => Self::Futurenet,
        }
    }
}

#[derive(Enum, Copy, Clone, Eq, PartialEq)]
pub enum VisibilityTypeGraphQL {
    Public,
    Private,
}

impl From<VisibilityType> for VisibilityTypeGraphQL {
    fn from(v: VisibilityType) -> Self {
        match v {
            VisibilityType::Public => Self::Public,
            VisibilityType::Private => Self::Private,
        }
    }
}

// ─── ContractVersionType ─────────────────────────────────────────────────────

pub struct ContractVersionType {
    pub id: Uuid,
    pub contract_id: Uuid,
    pub version: String,
    pub wasm_hash: String,
    pub source_url: Option<String>,
    pub commit_hash: Option<String>,
    pub release_notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[Object]
impl ContractVersionType {
    async fn id(&self) -> Uuid {
        self.id
    }
    async fn contract_id(&self) -> Uuid {
        self.contract_id
    }
    async fn version(&self) -> &str {
        &self.version
    }
    async fn wasm_hash(&self) -> &str {
        &self.wasm_hash
    }
    async fn source_url(&self) -> Option<&str> {
        self.source_url.as_deref()
    }
    async fn commit_hash(&self) -> Option<&str> {
        self.commit_hash.as_deref()
    }
    async fn release_notes(&self) -> Option<&str> {
        self.release_notes.as_deref()
    }
    async fn created_at(&self) -> DateTime<Utc> {
        self.created_at
    }

    /// Resolve the parent contract via DataLoader
    async fn contract(&self, ctx: &Context<'_>) -> Result<ContractType> {
        let loader =
            ctx.data_unchecked::<DataLoader<crate::graphql::loaders::DbLoader>>();
        let contract = loader
            .load_one(self.contract_id)
            .await?
            .ok_or_else(|| Error::new("Contract not found"))?;
        Ok(ContractType::from(contract))
    }
}

impl From<ContractVersion> for ContractVersionType {
    fn from(v: ContractVersion) -> Self {
        Self {
            id: v.id,
            contract_id: v.contract_id,
            version: v.version,
            wasm_hash: v.wasm_hash,
            source_url: v.source_url,
            commit_hash: v.commit_hash,
            release_notes: v.release_notes,
            created_at: v.created_at,
        }
    }
}

// ─── PublisherType ───────────────────────────────────────────────────────────

pub struct PublisherType {
    pub id: Uuid,
    pub stellar_address: String,
    pub username: Option<String>,
    pub email: Option<String>,
    pub github_url: Option<String>,
    pub website: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[Object]
impl PublisherType {
    async fn id(&self) -> Uuid {
        self.id
    }
    async fn stellar_address(&self) -> &str {
        &self.stellar_address
    }
    async fn username(&self) -> Option<&str> {
        self.username.as_deref()
    }
    async fn email(&self) -> Option<&str> {
        self.email.as_deref()
    }
    async fn github_url(&self) -> Option<&str> {
        self.github_url.as_deref()
    }
    async fn website(&self) -> Option<&str> {
        self.website.as_deref()
    }
    async fn created_at(&self) -> DateTime<Utc> {
        self.created_at
    }

    /// All contracts published by this publisher
    async fn contracts(&self, ctx: &Context<'_>) -> Result<Vec<ContractType>> {
        let state = ctx.data::<AppState>()?;
        let contracts: Vec<Contract> = sqlx::query_as(
            "SELECT * FROM contracts WHERE publisher_id = $1 ORDER BY created_at DESC",
        )
        .bind(self.id)
        .fetch_all(&state.db)
        .await?;
        Ok(contracts.into_iter().map(ContractType::from).collect())
    }
}

impl From<Publisher> for PublisherType {
    fn from(p: Publisher) -> Self {
        Self {
            id: p.id,
            stellar_address: p.stellar_address,
            username: p.username,
            email: p.email,
            github_url: p.github_url,
            website: p.website,
            created_at: p.created_at,
        }
    }
}

// ─── OrganizationType ────────────────────────────────────────────────────────

pub struct OrganizationType {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub is_private: bool,
    pub created_at: DateTime<Utc>,
}

#[Object]
impl OrganizationType {
    async fn id(&self) -> Uuid {
        self.id
    }
    async fn name(&self) -> &str {
        &self.name
    }
    async fn slug(&self) -> &str {
        &self.slug
    }
    async fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }
    async fn is_private(&self) -> bool {
        self.is_private
    }
    async fn created_at(&self) -> DateTime<Utc> {
        self.created_at
    }

    /// All contracts owned by this organisation
    async fn contracts(&self, ctx: &Context<'_>) -> Result<Vec<ContractType>> {
        let state = ctx.data::<AppState>()?;
        let contracts: Vec<Contract> = sqlx::query_as(
            "SELECT * FROM contracts WHERE organization_id = $1 ORDER BY created_at DESC",
        )
        .bind(self.id)
        .fetch_all(&state.db)
        .await?;
        Ok(contracts.into_iter().map(ContractType::from).collect())
    }
}

impl From<Organization> for OrganizationType {
    fn from(o: Organization) -> Self {
        Self {
            id: o.id,
            name: o.name,
            slug: o.slug,
            description: o.description,
            is_private: o.is_private,
            created_at: o.created_at,
        }
    }
}

// ─── Paginated response ───────────────────────────────────────────────────────

/// Paginated list of contracts returned by the `contracts` query
#[derive(SimpleObject)]
pub struct PaginatedContracts {
    pub items: Vec<ContractType>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
}
