/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * This file is part of the Collabora Office project.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * This file incorporates work covered by the following license notice:
 *
 *   Licensed to the Apache Software Foundation (ASF) under one or more
 *   contributor license agreements. See the NOTICE file distributed
 *   with this work for additional information regarding copyright
 *   ownership. The ASF licenses this file to you under the Apache
 *   License, Version 2.0 (the "License"); you may not use this file
 *   except in compliance with the License. You may obtain a copy of
 *   the License at http://www.apache.org/licenses/LICENSE-2.0 .
 */

#pragma once

#if !defined WIN32_LEAN_AND_MEAN
# define WIN32_LEAN_AND_MEAN
#endif
#include <Windows.h>
#include <WinCrypt.h>
#include <sal/config.h>
#include <rtl/ustring.hxx>
#include <cppuhelper/factory.hxx>
#include <cppuhelper/implbase.hxx>
#include <comphelper/servicehelper.hxx>
#include <cpo/uno/Exception.hpp>
#include <com/sun/star/lang/XServiceInfo.hpp>
#include <cpo/uno/SecurityException.hpp>
#include <com/sun/star/security/CertificateKind.hpp>
#include <com/sun/star/security/XCertificate.hpp>
#include <certificate.hxx>

class X509Certificate_MSCryptImpl : public ::cppu::WeakImplHelper<
    css::security::XCertificate ,
    css::lang::XServiceInfo > , public xmlsecurity::Certificate
{
    private:
        const CERT_CONTEXT* m_pCertContext ;

    public:
        X509Certificate_MSCryptImpl() ;
        virtual ~X509Certificate_MSCryptImpl() override;

        //Methods from XCertificate
        virtual sal_Int16 getVersion() override;

        virtual cpo::uno::Sequence< sal_Int8 > getSerialNumber() override;
        virtual OUString getIssuerName() override;
        virtual OUString getSubjectName() override;
        virtual css::util::DateTime getNotValidBefore() override;
        virtual css::util::DateTime getNotValidAfter() override;
        virtual cpo::uno::Sequence< sal_Int8 > getIssuerUniqueID() override;
        virtual cpo::uno::Sequence< sal_Int8 > getSubjectUniqueID() override;
        virtual cpo::uno::Sequence< cpo::uno::Reference< css::security::XCertificateExtension > > getExtensions() override;
        virtual cpo::uno::Reference< css::security::XCertificateExtension > findCertificateExtension( const cpo::uno::Sequence< sal_Int8 >& oid ) override;
        virtual cpo::uno::Sequence< sal_Int8 > getEncoded() override;
        virtual OUString getSubjectPublicKeyAlgorithm() override;
        virtual cpo::uno::Sequence< sal_Int8 > getSubjectPublicKeyValue() override;
        virtual OUString getSignatureAlgorithm() override;
        virtual cpo::uno::Sequence< sal_Int8 > getSHA1Thumbprint() override;
        virtual cpo::uno::Sequence< sal_Int8 > getMD5Thumbprint() override;
        virtual css::security::CertificateKind getCertificateKind() override;


        virtual sal_Int32 getCertificateUsage( ) override;

        /// @see xmlsecurity::Certificate::getSHA256Thumbprint().
        virtual cpo::uno::Sequence<sal_Int8> getSHA256Thumbprint() override;

        /// @see xmlsecurity::Certificate::getSignatureMethodAlgorithm().
        virtual svl::crypto::SignatureMethodAlgorithm getSignatureMethodAlgorithm() override;

        //Helper methods
        void setMswcryCert( const CERT_CONTEXT* cert ) ;
        const CERT_CONTEXT* getMswcryCert() const ;
        /// @throws cpo::uno::RuntimeException
        void setRawCert( cpo::uno::Sequence< sal_Int8 > const & rawCert ) ;

        // XServiceInfo
        virtual OUString getImplementationName() override;
        virtual bool supportsService(const OUString& ServiceName) override;
        virtual cpo::uno::Sequence<OUString> getSupportedServiceNames() override;
} ;

/* vim:set shiftwidth=4 softtabstop=4 expandtab: */
