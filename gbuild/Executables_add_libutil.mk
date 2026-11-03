define gb_add_libutil
ifeq ($(OS),FREEBSD)
MAJORVERSION := $(basename $(shell /bin/freebsd-version -u))

ifeq ($$(MAJORVERSION),14)
ifneq ($(filter coolforkit-caps coolforkit-ns coolwsd,$(1)),)
$$(eval $$(call gb_Executable_add_libs,$(1),-lutil))
endif
else ifeq ($$(MAJORVERSION),15)
$$(eval $$(call gb_Executable_add_libs,$(1),-lutil))
endif
endif
endef
