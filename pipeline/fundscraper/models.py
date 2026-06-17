"""SQLAlchemy 2.0 ORM models for the Form D scraper."""

import datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.orm import relationship as rel


class Base(DeclarativeBase):
    pass


class Filing(Base):
    __tablename__ = "filings"

    accession_number: Mapped[str] = mapped_column(Text, primary_key=True)
    cik: Mapped[str] = mapped_column(Text, index=True)
    company_name: Mapped[str] = mapped_column(Text)
    form_type: Mapped[str] = mapped_column(Text)  # D or D/A
    date_filed: Mapped[datetime.date] = mapped_column(Date)
    fetched_at: Mapped[datetime.datetime] = mapped_column(DateTime)
    raw_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    parse_status: Mapped[str] = mapped_column(Text, default="ok")  # ok / unsupported / error

    offering: Mapped["Offering | None"] = rel("Offering", back_populates="filing", uselist=False)
    related_persons: Mapped[list["RelatedPerson"]] = rel("RelatedPerson", back_populates="filing")


class Offering(Base):
    __tablename__ = "offerings"

    accession_number: Mapped[str] = mapped_column(
        Text, ForeignKey("filings.accession_number"), primary_key=True
    )
    issuer_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    entity_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    jurisdiction: Mapped[str | None] = mapped_column(Text, nullable=True)
    year_of_incorporation: Mapped[str | None] = mapped_column(Text, nullable=True)
    industry_group: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_pooled_fund: Mapped[bool] = mapped_column(Boolean, default=False)
    is_likely_fund: Mapped[bool] = mapped_column(Boolean, default=False)
    total_offering_amount: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    total_amount_sold: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    total_remaining: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    min_investment: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    num_investors: Mapped[int | None] = mapped_column(Integer, nullable=True)
    date_first_sale: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    is_amendment: Mapped[bool] = mapped_column(Boolean, default=False)

    filing: Mapped["Filing"] = rel("Filing", back_populates="offering")


class RelatedPerson(Base):
    __tablename__ = "related_persons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    accession_number: Mapped[str] = mapped_column(
        Text, ForeignKey("filings.accession_number"), index=True
    )
    name: Mapped[str] = mapped_column(Text)
    relationship: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str | None] = mapped_column(Text, nullable=True)
    state: Mapped[str | None] = mapped_column(Text, nullable=True)

    filing: Mapped["Filing"] = rel("Filing", back_populates="related_persons")


class Issuer(Base):
    __tablename__ = "issuers"

    cik: Mapped[str] = mapped_column(Text, primary_key=True)
    normalized_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    first_seen: Mapped[datetime.date] = mapped_column(Date)
    last_seen: Mapped[datetime.date] = mapped_column(Date)


class RunLog(Base):
    __tablename__ = "run_log"

    run_date: Mapped[datetime.date] = mapped_column(Date, primary_key=True)
    status: Mapped[str] = mapped_column(Text, default="complete")  # complete / partial / failed
    filings_seen: Mapped[int] = mapped_column(Integer, default=0)
    filings_stored: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
