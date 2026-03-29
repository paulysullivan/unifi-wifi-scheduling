from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import UnifiCredential, User
from auth import get_current_user
from encryption import encrypt, decrypt
from schemas import CredentialCreate, CredentialUpdate, CredentialResponse, TestConnectionResponse
from unifi import UnifiClient

router = APIRouter(prefix="/api/credentials", tags=["credentials"])


@router.get("", response_model=list[CredentialResponse])
async def list_credentials(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(select(UnifiCredential))
    return result.scalars().all()


@router.post("", response_model=CredentialResponse)
async def create_credential(
    body: CredentialCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    cred = UnifiCredential(
        label=body.label,
        host=body.host,
        username=body.username,
        encrypted_password=encrypt(body.password),
        site_id=body.site_id,
        verify_ssl=body.verify_ssl,
    )
    db.add(cred)
    await db.commit()
    await db.refresh(cred)
    return cred


@router.put("/{cred_id}", response_model=CredentialResponse)
async def update_credential(
    cred_id: int,
    body: CredentialUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    cred = await db.get(UnifiCredential, cred_id)
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "password" and value is not None:
            cred.encrypted_password = encrypt(value)
        elif field != "password":
            setattr(cred, field, value)
    await db.commit()
    await db.refresh(cred)
    return cred


@router.delete("/{cred_id}")
async def delete_credential(
    cred_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    cred = await db.get(UnifiCredential, cred_id)
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    await db.delete(cred)
    await db.commit()
    return {"message": "Deleted"}


@router.post("/{cred_id}/test", response_model=TestConnectionResponse)
async def test_connection(
    cred_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    cred = await db.get(UnifiCredential, cred_id)
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")

    client = UnifiClient(
        host=cred.host,
        username=cred.username,
        password=decrypt(cred.encrypted_password),
        site_id=cred.site_id,
        verify_ssl=cred.verify_ssl,
    )
    try:
        success, message, site_name = await client.test_connection()
        cred.last_tested_at = datetime.utcnow()
        cred.last_test_success = success
        await db.commit()
        return TestConnectionResponse(success=success, message=message, site_name=site_name)
    finally:
        await client.close()


@router.post("/{cred_id}/activate", response_model=CredentialResponse)
async def activate_credential(
    cred_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    cred = await db.get(UnifiCredential, cred_id)
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")

    # Deactivate all others
    result = await db.execute(select(UnifiCredential))
    for c in result.scalars().all():
        c.is_active = c.id == cred_id
    await db.commit()
    await db.refresh(cred)
    return cred
