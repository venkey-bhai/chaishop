import logging
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

try:
    from database.connection import get_db
    from config import settings
    from models.user import User, UserRole
    from models.customer import Customer
    from models.credit import CreditAccount
    from schemas.auth import (
        UserRegisterRequest,
        UserLoginRequest,
        UserResponse,
        TokenResponse,
        LogoutResponse,
    )
    from utils.security import hash_password, verify_password, create_access_token
    from dependencies.auth import (
        get_current_active_user,
        require_admin,
        require_customer,
    )
except ImportError:
    from backend.database.connection import get_db
    from backend.config import settings
    from backend.models.user import User, UserRole
    from backend.models.customer import Customer
    from backend.models.credit import CreditAccount
    from backend.schemas.auth import (
        UserRegisterRequest,
        UserLoginRequest,
        UserResponse,
        TokenResponse,
        LogoutResponse,
    )
    from backend.utils.security import hash_password, verify_password, create_access_token
    from backend.dependencies.auth import (
        get_current_active_user,
        require_admin,
        require_customer,
    )

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def _build_user_response(user: User) -> UserResponse:
    """
    Constructs a serialized UserResponse DTO, embedding linked customer and credit info.
    """
    customer_id = None
    is_credit_eligible = None
    credit_limit = None

    if hasattr(user, "customer") and user.customer:
        customer_id = user.customer.id
        is_credit_eligible = user.customer.is_credit_eligible
        credit_limit = user.customer.credit_limit

    return UserResponse(
        id=user.id,
        mobile_number=user.mobile_number,
        name=user.name,
        email=user.email,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
        is_active=user.is_active,
        customer_id=customer_id,
        is_credit_eligible=is_credit_eligible,
        credit_limit=credit_limit,
        created_at=user.created_at,
    )


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register Customer",
    description="Registers a new customer using their mobile phone number, creates a linked customer profile, and returns an access token."
)
def register_customer(payload: UserRegisterRequest, db: Session = Depends(get_db)):
    # 1. Verify mobile number uniqueness
    existing_phone = db.query(User).filter(User.mobile_number == payload.mobile_number).first()
    if existing_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this mobile number is already registered. Please login.",
        )

    # 2. Verify optional email uniqueness if provided
    if payload.email:
        existing_email = db.query(User).filter(User.email == payload.email).first()
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email address is already registered.",
            )

    # 3. Securely hash password
    hashed_pwd = hash_password(payload.password)

    try:
        # 4. Create User entity
        new_user = User(
            mobile_number=payload.mobile_number,
            name=payload.name,
            email=payload.email,
            hashed_password=hashed_pwd,
            role=UserRole.CUSTOMER,
            is_active=True,
        )
        db.add(new_user)
        db.flush()  # Populates new_user.id for foreign keys

        # 5. Automatically provision Customer profile record
        new_customer = Customer(
            user_id=new_user.id,
            name=payload.name,
            phone=payload.mobile_number,
            email=payload.email,
            is_credit_eligible=False,  # Rule 61: Admin must explicitly enable credit
            credit_limit=Decimal("0.00"),
        )
        db.add(new_customer)
        db.flush()  # Populates new_customer.id

        # 6. Initialize zeroed CreditAccount record
        new_credit_account = CreditAccount(
            customer_id=new_customer.id,
            credit_limit=Decimal("0.00"),
            current_balance=Decimal("0.00"),
            is_active=False,
        )
        db.add(new_credit_account)

        db.commit()
        db.refresh(new_user)
        logger.info(f"Registered new customer user id={new_user.id}, mobile={new_user.mobile_number}")
    except Exception as e:
        db.rollback()
        logger.error(f"Error during customer registration: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register user due to a database error.",
        )

    # 7. Generate JWT Bearer Token
    token_claims = {
        "sub": str(new_user.id),
        "role": new_user.role.value,
        "mobile": new_user.mobile_number,
    }
    access_token = create_access_token(data=token_claims)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_build_user_response(new_user),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login User",
    description="Authenticates customer, staff, or admin with mobile number and password, returning a JWT token."
)
def login_user(payload: UserLoginRequest, db: Session = Depends(get_db)):
    # 1. Fetch user by registered mobile number
    user = db.query(User).options(joinedload(User.customer)).filter(User.mobile_number == payload.mobile_number).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid mobile number or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Validate password hash
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid mobile number or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Check account activation status
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your user account has been deactivated. Please contact the tea shop manager.",
        )

    # 4. Issue fresh JWT token
    token_claims = {
        "sub": str(user.id),
        "role": user.role.value,
        "mobile": user.mobile_number,
    }
    access_token = create_access_token(data=token_claims)

    logger.info(f"User login successful: id={user.id}, role={user.role.value}")

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_build_user_response(user),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get Current User",
    description="Returns profile details of the authenticated user decoded from the Bearer token."
)
def get_current_user_profile(
    current_user: User = Depends(get_current_active_user)
):
    return _build_user_response(current_user)


@router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Logout User",
    description="Stateless logout endpoint acknowledging client session termination."
)
def logout_user():
    return LogoutResponse(
        success=True,
        message="Session successfully terminated. Please discard client token."
    )


# Role-protected test verification endpoints for integration verification
@router.get(
    "/admin-check",
    summary="Admin Role Check",
    description="Protected route restricted exclusively to users with ADMIN role."
)
def check_admin_access(current_user: User = Depends(require_admin)):
    return {
        "status": "authorized",
        "message": f"Welcome Admin {current_user.name}!",
        "role": current_user.role.value
    }


@router.get(
    "/customer-check",
    summary="Customer Role Check",
    description="Protected route restricted exclusively to users with CUSTOMER role."
)
def check_customer_access(current_user: User = Depends(require_customer)):
    return {
        "status": "authorized",
        "message": f"Welcome Customer {current_user.name}!",
        "customer_id": current_user.customer.id if current_user.customer else None
    }
