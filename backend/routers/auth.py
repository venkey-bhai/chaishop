import logging
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

try:
    from database.connection import get_db
    from config import settings
    from models.user import User, UserRole
    from models.admin_user import AdminUser
    from models.customer_user import CustomerUser
    from models.customer import Customer
    from models.credit import CreditAccount
    from schemas.auth import (
        UserRegisterRequest,
        UserLoginRequest,
        CustomerSignupRequest,
        AdminSignupRequest,
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
    from backend.models.admin_user import AdminUser
    from backend.models.customer_user import CustomerUser
    from backend.models.customer import Customer
    from backend.models.credit import CreditAccount
    from backend.schemas.auth import (
        UserRegisterRequest,
        UserLoginRequest,
        CustomerSignupRequest,
        AdminSignupRequest,
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


def _build_user_response(user) -> UserResponse:
    """
    Constructs a serialized UserResponse DTO, embedding linked customer and credit info.
    Supports AdminUser, CustomerUser, and legacy User models.
    """
    if isinstance(user, AdminUser):
        return UserResponse(
            id=user.id,
            mobile_number=user.mobile_number,
            name=user.full_name,
            email=user.email,
            role="ADMIN",
            shop_name=user.shop_name or settings.SHOP_NAME,
            is_active=user.is_active,
            customer_id=None,
            is_credit_eligible=None,
            credit_limit=None,
            created_at=user.created_at,
        )

    if isinstance(user, CustomerUser):
        cust = user.customer_profile
        return UserResponse(
            id=user.id,
            mobile_number=user.mobile_number,
            name=user.full_name,
            email=user.email,
            role="CUSTOMER",
            shop_name=None,
            is_active=user.is_active,
            customer_id=cust.id if cust else None,
            is_credit_eligible=cust.is_credit_eligible if cust else False,
            credit_limit=cust.credit_limit if cust else Decimal("0.00"),
            created_at=user.created_at,
        )

    # Legacy User model fallback
    customer_id = None
    is_credit_eligible = None
    credit_limit = None

    if hasattr(user, "customer") and user.customer:
        customer_id = user.customer.id
        is_credit_eligible = user.customer.is_credit_eligible
        credit_limit = user.customer.credit_limit

    role_val = user.role.value if hasattr(user.role, "value") else str(user.role).upper()

    return UserResponse(
        id=user.id,
        mobile_number=user.mobile_number,
        name=user.name,
        email=user.email,
        role=role_val,
        shop_name=settings.SHOP_NAME if role_val == "ADMIN" else None,
        is_active=user.is_active,
        customer_id=customer_id,
        is_credit_eligible=is_credit_eligible,
        credit_limit=credit_limit,
        created_at=user.created_at,
    )


@router.post(
    "/signup/customer",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Customer Signup",
    description="Public customer registration creating a record in customer_users and linking to customer profile."
)
def signup_customer(payload: CustomerSignupRequest, db: Session = Depends(get_db)):
    # 1. Password confirmation check
    if payload.confirm_password and payload.confirm_password != payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password and Confirm Password do not match.",
        )

    # 2. Check mobile number uniqueness in customer_users and admin_users
    existing_cu = db.query(CustomerUser).filter(CustomerUser.mobile_number == payload.mobile_number).first()
    if existing_cu:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this mobile number is already registered. Please login.",
        )

    existing_admin = db.query(AdminUser).filter(AdminUser.mobile_number == payload.mobile_number).first()
    if existing_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this mobile number is already registered. Please login.",
        )

    # 3. Check optional email uniqueness
    if payload.email:
        if db.query(CustomerUser).filter(CustomerUser.email == payload.email).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email address is already registered.",
            )

    hashed_pwd = hash_password(payload.password)

    try:
        # 4. Create CustomerUser record
        new_cu = CustomerUser(
            full_name=payload.full_name,
            mobile_number=payload.mobile_number,
            email=payload.email,
            password_hash=hashed_pwd,
            is_active=True,
        )
        db.add(new_cu)
        db.flush()

        # 5. Link with existing Customer profile or create new
        existing_cust = db.query(Customer).filter(Customer.phone == payload.mobile_number).first()
        if existing_cust:
            existing_cust.customer_user_id = new_cu.id
            if not existing_cust.name:
                existing_cust.name = payload.full_name
            if not existing_cust.email and payload.email:
                existing_cust.email = payload.email
            cust_record = existing_cust
        else:
            cust_record = Customer(
                name=payload.full_name,
                phone=payload.mobile_number,
                email=payload.email,
                customer_user_id=new_cu.id,
                is_credit_eligible=False,
                credit_limit=Decimal("0.00"),
            )
            db.add(cust_record)
            db.flush()

        # 6. Ensure CreditAccount exists
        if not cust_record.credit_account:
            credit_acc = CreditAccount(
                customer_id=cust_record.id,
                credit_limit=Decimal("0.00"),
                current_balance=Decimal("0.00"),
                is_active=False,
            )
            db.add(credit_acc)

        # 7. Sync legacy User table for FK backwards compatibility
        legacy_user = db.query(User).filter(User.mobile_number == payload.mobile_number).first()
        if not legacy_user:
            legacy_user = User(
                mobile_number=payload.mobile_number,
                name=payload.full_name,
                email=payload.email,
                hashed_password=hashed_pwd,
                role=UserRole.CUSTOMER,
                is_active=True,
            )
            db.add(legacy_user)
            db.flush()

        if not cust_record.user_id:
            cust_record.user_id = legacy_user.id

        db.commit()
        db.refresh(new_cu)
        logger.info(f"Registered new CustomerUser id={new_cu.id}, mobile={new_cu.mobile_number}")
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error during customer signup: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register customer due to a database error.",
        )

    # 8. Generate JWT token
    token_claims = {
        "sub": str(new_cu.id),
        "user_type": "customer",
        "role": "CUSTOMER",
        "mobile": new_cu.mobile_number,
    }
    access_token = create_access_token(data=token_claims)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_build_user_response(new_cu),
    )


@router.post(
    "/signup/admin",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Admin Signup",
    description="Protected admin account registration requiring valid Admin Authorization Secret Key."
)
def signup_admin(payload: AdminSignupRequest, db: Session = Depends(get_db)):
    # 1. Strict security check: Verify Admin Secret Key
    expected_secret = getattr(settings, "ADMIN_REGISTRATION_SECRET", "CHAIFLOW_ADMIN_SECRET_2026")
    if not payload.admin_secret or payload.admin_secret.strip() != expected_secret.strip():
        logger.warning(f"Unauthorized admin signup attempt with mobile: {payload.mobile_number}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Admin Authorization Secret Key. Only authorized administrators may create an Admin account.",
        )

    # 2. Password confirmation check
    if payload.confirm_password and payload.confirm_password != payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password and Confirm Password do not match.",
        )

    # 3. Check mobile number uniqueness in admin_users and customer_users
    existing_admin = db.query(AdminUser).filter(AdminUser.mobile_number == payload.mobile_number).first()
    if existing_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An Admin account with this mobile number already exists. Please sign in.",
        )

    existing_cu = db.query(CustomerUser).filter(CustomerUser.mobile_number == payload.mobile_number).first()
    if existing_cu:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This mobile number is already registered as a Customer.",
        )

    # 4. Check optional email uniqueness
    if payload.email:
        if db.query(AdminUser).filter(AdminUser.email == payload.email).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An admin account with this email address already exists.",
            )

    hashed_pwd = hash_password(payload.password)

    try:
        # 5. Create AdminUser record
        new_admin = AdminUser(
            full_name=payload.full_name,
            mobile_number=payload.mobile_number,
            email=payload.email,
            password_hash=hashed_pwd,
            shop_name=payload.shop_name or settings.SHOP_NAME,
            is_active=True,
        )
        db.add(new_admin)
        db.flush()

        # 6. Sync legacy User table for FK compatibility
        legacy_admin = db.query(User).filter(User.mobile_number == payload.mobile_number).first()
        if not legacy_admin:
            legacy_admin = User(
                mobile_number=payload.mobile_number,
                name=payload.full_name,
                email=payload.email,
                hashed_password=hashed_pwd,
                role=UserRole.ADMIN,
                is_active=True,
            )
            db.add(legacy_admin)
        else:
            legacy_admin.role = UserRole.ADMIN

        db.commit()
        db.refresh(new_admin)
        logger.info(f"Registered new AdminUser id={new_admin.id}, mobile={new_admin.mobile_number}")
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error during admin signup: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create Admin account due to a database error.",
        )

    # 7. Issue JWT token
    token_claims = {
        "sub": str(new_admin.id),
        "user_type": "admin",
        "role": "ADMIN",
        "mobile": new_admin.mobile_number,
    }
    access_token = create_access_token(data=token_claims)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_build_user_response(new_admin),
    )


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register Customer (Legacy Alias)",
    description="Registers a new customer using customer signup flow."
)
def register_customer(payload: UserRegisterRequest, db: Session = Depends(get_db)):
    cu_payload = CustomerSignupRequest(
        full_name=payload.name,
        mobile_number=payload.mobile_number,
        email=payload.email,
        password=payload.password,
    )
    return signup_customer(cu_payload, db=db)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login User",
    description="Authenticates Admin or Customer with mobile number and password, returning a JWT token."
)
def login_user(payload: UserLoginRequest, db: Session = Depends(get_db)):
    # 1. Check Admin Users table
    admin = db.query(AdminUser).filter(AdminUser.mobile_number == payload.mobile_number).first()
    if admin:
        if not verify_password(payload.password, admin.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid mobile number or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not admin.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your Admin account has been deactivated. Please contact support.",
            )
        token_claims = {
            "sub": str(admin.id),
            "user_type": "admin",
            "role": "ADMIN",
            "mobile": admin.mobile_number,
        }
        access_token = create_access_token(data=token_claims)
        logger.info(f"Admin login successful: id={admin.id}, mobile={admin.mobile_number}")
        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=_build_user_response(admin),
        )

    # 2. Check Customer Users table
    customer_user = db.query(CustomerUser).options(
        joinedload(CustomerUser.customer_profile).joinedload(Customer.credit_account)
    ).filter(CustomerUser.mobile_number == payload.mobile_number).first()

    if customer_user:
        if not verify_password(payload.password, customer_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid mobile number or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not customer_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your Customer account has been deactivated. Please contact the tea shop manager.",
            )
        token_claims = {
            "sub": str(customer_user.id),
            "user_type": "customer",
            "role": "CUSTOMER",
            "mobile": customer_user.mobile_number,
        }
        access_token = create_access_token(data=token_claims)
        logger.info(f"Customer login successful: id={customer_user.id}, mobile={customer_user.mobile_number}")
        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=_build_user_response(customer_user),
        )

    # 3. Fallback to legacy Users table
    legacy_user = db.query(User).options(
        joinedload(User.customer).joinedload(Customer.credit_account)
    ).filter(User.mobile_number == payload.mobile_number).first()

    if legacy_user:
        if not verify_password(payload.password, legacy_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid mobile number or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not legacy_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been deactivated.",
            )
        role_val = legacy_user.role.value if hasattr(legacy_user.role, "value") else str(legacy_user.role)
        token_claims = {
            "sub": str(legacy_user.id),
            "user_type": "legacy",
            "role": role_val,
            "mobile": legacy_user.mobile_number,
        }
        access_token = create_access_token(data=token_claims)
        logger.info(f"Legacy user login successful: id={legacy_user.id}, role={role_val}")
        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=_build_user_response(legacy_user),
        )

    # 4. If none matched
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid mobile number or password.",
        headers={"WWW-Authenticate": "Bearer"},
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
